// app.js - Código unificado para Acuario IoT (con polling para tabla de registros)

// Constantes de la API
const API_BASE = 'https://68ccc004da4697a7f3036e64.mockapi.io/api/v1';
const DISPOSITIVOS_URL = `${API_BASE}/dispositivos`;
const REGISTROS_URL = `${API_BASE}/registros`;

// Variables para controlar el temporizador de notificaciones
let notificationInterval = null;
let notificationCount = 0;
let isFirstNotification = true;

// Variable para controlar el intervalo de polling de la tabla
let allRegistrosInterval = null;

/* ----------------- UTILIDADES ----------------- */
async function apiGet(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.json();
}

async function apiPost(url, body) {
  const res = await fetch(url, { 
    method: 'POST', 
    headers: {'Content-Type':'application/json'}, 
    body: JSON.stringify(body) 
  });
  return res.json();
}

async function apiPut(url, body) {
  const res = await fetch(url, { 
    method: 'PUT', 
    headers: {'Content-Type':'application/json'}, 
    body: JSON.stringify(body) 
  });
  return res.json();
}

async function apiDelete(url) {
  const res = await fetch(url, { method: 'DELETE' });
  return res.json();
}

function escapeHtml(text) {
  if (text == null) return '';
  return String(text).replace(/[&<>"']/g, s => {
    return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[s];
  });
}

/* ----------------- ALERTAS GLOBALES CON TEMPORIZADOR ----------------- */
async function refreshGlobalAlerts() {
  const container = document.getElementById('globalAlertContainer');
  if (!container) return;

  try {
    const devices = await apiGet(DISPOSITIVOS_URL);
    
    // Limpiar solo las alertas, mantener el estilo del contenedor
    const existingAlerts = container.querySelectorAll('.alert');
    existingAlerts.forEach(alert => alert.remove());

    // Si es la primera notificación o ha pasado el tiempo suficiente
    if (isFirstNotification || notificationCount >= 6) { // 6 intervalos de 30 segundos = 3 minutos
      isFirstNotification = false;
      notificationCount = 0;
      
      let hasCriticalAlerts = false;
      let hasWarningAlerts = false;
      let mostCriticalAlert = null;

      for (const d of devices) {
        if (d.ph_actual != null && d.ph_objetivo != null) {
          const diff = Math.abs(d.ph_actual - d.ph_objetivo);
          
          // pH ácido (menor a 6.5) - Prioridad máxima
          if (d.ph_actual < 6.5) {
            hasCriticalAlerts = true;
            // Guardar la alerta más crítica
            if (!mostCriticalAlert || d.ph_actual < mostCriticalAlert.ph_actual) {
              mostCriticalAlert = {
                device: d,
                type: 'danger',
                message: `¡pH ÁCIDO! ${escapeHtml(d.nombre)} (${escapeHtml(d.tipo)}) - pH: ${d.ph_actual} / objetivo: ${d.ph_objetivo}`
              };
            }
          }
          // pH fuera de rango (diferencia >= 0.3) - Prioridad media
          else if (diff >= 0.3 && !hasCriticalAlerts) {
            hasWarningAlerts = true;
            // Solo guardar una alerta de advertencia si no hay críticas
            if (!mostCriticalAlert) {
              mostCriticalAlert = {
                device: d,
                type: 'warning',
                message: `pH fuera de rango: ${escapeHtml(d.nombre)} (${escapeHtml(d.tipo)}) - pH: ${d.ph_actual} / objetivo: ${d.ph_objetivo}`
              };
            }
          }
        }
      }

      // Mostrar solo la alerta más crítica
      if (mostCriticalAlert) {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${mostCriticalAlert.type}`;
        alertDiv.innerHTML = `
          <strong>${mostCriticalAlert.type === 'danger' ? '¡pH ÁCIDO!' : 'pH fuera de rango'}</strong><br>
          ${escapeHtml(mostCriticalAlert.device.nombre)} (${escapeHtml(mostCriticalAlert.device.tipo)})<br>
          pH: ${mostCriticalAlert.device.ph_actual} / objetivo: ${mostCriticalAlert.device.ph_objetivo}
          <button class="btn btn-sm btn-warning mt-2 w-100" onclick="activateDosificador('${mostCriticalAlert.device.id}')">Activar dosificador</button>
        `;
        container.appendChild(alertDiv);
      } else {
        const successAlert = document.createElement('div');
        successAlert.className = 'alert alert-success';
        successAlert.textContent = 'Todos los dispositivos dentro del rango de pH óptimo.';
        container.appendChild(successAlert);
      }
    } else {
      // Incrementar el contador para la próxima verificación
      notificationCount++;
      
      // Mostrar mensaje de que el sistema está monitoreando
      const monitoringAlert = document.createElement('div');
      monitoringAlert.className = 'alert alert-info';
      monitoringAlert.textContent = 'Sistema monitoreando dispositivos...';
      container.appendChild(monitoringAlert);
    }
  } catch (err) {
    console.error('Error al refrescar alertas globales:', err);
    const errorAlert = document.createElement('div');
    errorAlert.className = 'alert alert-danger';
    errorAlert.textContent = 'Error al obtener alertas.';
    document.getElementById('globalAlertContainer').appendChild(errorAlert);
  }
}

/* ----------------- INICIAR TEMPORIZADOR DE NOTIFICACIONES ----------------- */
function startNotificationTimer() {
  // Detener cualquier temporizador existente
  if (notificationInterval) {
    clearInterval(notificationInterval);
  }
  
  // Iniciar con intervalos de 30 segundos
  notificationInterval = setInterval(refreshGlobalAlerts, 30000); // 30 segundos
  
  // Ejecutar inmediatamente la primera vez
  refreshGlobalAlerts();
}

/* ----------------- REGISTROS GLOBALES - CORREGIDO ----------------- */
async function refreshAllRegistros() {
  const tbody = document.getElementById('allRegsTbody');
  if (!tbody) return;

  try {
    // Obtener últimos 10 registros de todos los dispositivos
    const registros = await apiGet(`${REGISTROS_URL}?sortBy=timestamp&order=desc&limit=10`);
    
    if (!registros.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center">No hay registros</td></tr>';
      return;
    }

    // Obtener información de dispositivos para mostrar nombres
    const dispositivos = await apiGet(DISPOSITIVOS_URL);
    const dispositivosMap = {};
    dispositivos.forEach(d => {
      dispositivosMap[d.id] = d;
    });

    tbody.innerHTML = '';
    
    // Filtrar y mostrar solo registros que tienen un dispositivo válido
    const registrosValidos = registros.filter(r => dispositivosMap[r.dispositivo_id]);
    
    if (!registrosValidos.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center">No hay registros válidos</td></tr>';
      return;
    }

    registrosValidos.forEach(r => {
      const dispositivo = dispositivosMap[r.dispositivo_id];
      const ph = r.ph ?? '-';
      
      // Determinar el estado del pH
      let estadoPh = 'Normal';
      let estadoClass = 'text-success';
      
      if (ph !== '-') {
        if (ph < 6.5) {
          estadoPh = 'ÁCIDO';
          estadoClass = 'text-danger fw-bold';
        } else if (ph < 6.8) {
          estadoPh = 'Ligeramente ácido';
          estadoClass = 'text-warning';
        } else if (ph > 8.5) {
          estadoPh = 'Alcalino';
          estadoClass = 'text-warning';
        }
      } else {
        estadoPh = 'Sin dato';
        estadoClass = 'text-muted';
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(dispositivo.nombre)}</td>
        <td>${escapeHtml(dispositivo.tipo)}</td>
        <td>${escapeHtml(dispositivo.ubicacion || '')}</td>
        <td>${escapeHtml(dispositivo.ip || '')}</td>
        <td>${ph}</td>
        <td class="${estadoClass}">${estadoPh}</td>
        <td>${r.dosificador_activado ? 'Si' : 'No'}</td>
        <td>${new Date(r.timestamp).toLocaleString()}</td>
      `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error('Error al cargar registros globales:', err);
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Error al cargar registros</td></tr>';
  }
}

/* ----------------- INICIAR POLLING PARA TABLA DE REGISTROS ----------------- */
function startAllRegistrosPolling() {
  // Detener cualquier intervalo existente
  if (allRegistrosInterval) {
    clearInterval(allRegistrosInterval);
  }
  
  // Iniciar polling cada 2 segundos (2000 ms)
  allRegistrosInterval = setInterval(refreshAllRegistros, 2000);
  
  // Ejecutar inmediatamente la primera vez
  refreshAllRegistros();
}

/* ----------------- DETENER POLLING ----------------- */
function stopAllRegistrosPolling() {
  if (allRegistrosInterval) {
    clearInterval(allRegistrosInterval);
    allRegistrosInterval = null;
  }
}

/* ----------------- ACTIVAR DOSIFICADOR ----------------- */
window.activateDosificador = async function(deviceId) {
  try {
    const d = await apiGet(`${DISPOSITIVOS_URL}/${deviceId}`);
    const payload = {
      dispositivo_id: deviceId,
      ph: d.ph_actual ?? null,
      dosificador_activado: true,
      timestamp: new Date().toISOString()
    };
    await apiPost(REGISTROS_URL, payload);
    alert(`Dosificador activado para ${d.nombre}.`);
    refreshGlobalAlerts();
    refreshAllRegistros();
  } catch (err) {
    alert('Error al activar dosificador: ' + err.message);
  }
};

/* ----------------- LÓGICA ADMIN ----------------- */
async function initAdmin(){
  const btnNuevo = document.getElementById('btnNuevo');
  const formArea = document.getElementById('formArea');
  const deviceForm = document.getElementById('deviceForm');
  const cancelBtn = document.getElementById('cancelBtn');

  if (!btnNuevo || !formArea || !deviceForm || !cancelBtn) return;

  btnNuevo.onclick = () => {
    formArea.classList.remove('d-none');
    deviceForm.reset();
    document.getElementById('deviceId').value = '';
  };
  
  cancelBtn.onclick = () => formArea.classList.add('d-none');

  deviceForm.onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('deviceId').value;
    const payload = {
      nombre: document.getElementById('nombre').value,
      tipo: document.getElementById('tipo').value,
      ubicacion: document.getElementById('ubicacion').value,
      estado: document.getElementById('estado').value,
      ph_actual: parseFloat(document.getElementById('ph_actual').value) || 0,
      ph_objetivo: parseFloat(document.getElementById('ph_objetivo').value) || 7,
      automatico: document.getElementById('automatico').value === 'true',
      ip: document.getElementById('ip').value
    };
    
    try {
      if (id) {
        await apiPut(`${DISPOSITIVOS_URL}/${id}`, payload);
      } else {
        await apiPost(DISPOSITIVOS_URL, payload);
      }
      formArea.classList.add('d-none');
      await renderDevices();
    } catch (err) { 
      alert('Error al guardar: '+err.message); 
    }
  };

  await renderDevices();
}

async function renderDevices(){
  const tbody = document.getElementById('devicesTbody');
  if (!tbody) return;
  
  tbody.innerHTML = '<tr><td colspan="8">Cargando...</td></tr>';
  
  try {
    const devices = await apiGet(DISPOSITIVOS_URL);
    if (!devices.length) { 
      tbody.innerHTML = '<tr><td colspan="8">No hay dispositivos</td></tr>'; 
      return; 
    }
    
    tbody.innerHTML = '';
    devices.forEach(d => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(d.nombre)}</td>
        <td>${escapeHtml(d.tipo)}</td>
        <td>${escapeHtml(d.ubicacion||'')}</td>
        <td>${escapeHtml(d.estado||'')}</td>
        <td>${d.ph_actual ?? '-'} / ${d.ph_objetivo ?? '-'}</td>
        <td>${d.automatico ? 'true' : 'false'}</td>
        <td>${escapeHtml(d.ip || '')}</td>
        <td>
          <button class="btn btn-sm btn-primary btn-edit" data-id="${d.id}">Editar</button>
          <button class="btn btn-sm btn-danger btn-delete" data-id="${d.id}">Borrar</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    document.querySelectorAll('.btn-edit').forEach(b => {
      b.onclick = async () => {
        const id = b.dataset.id;
        const d = await apiGet(`${DISPOSITIVOS_URL}/${id}`);
        document.getElementById('deviceId').value = d.id;
        document.getElementById('nombre').value = d.nombre || '';
        document.getElementById('tipo').value = d.tipo || '';
        document.getElementById('ubicacion').value = d.ubicacion || '';
        document.getElementById('estado').value = d.estado || 'inactivo';
        document.getElementById('ph_actual').value = d.ph_actual ?? '';
        document.getElementById('ph_objetivo').value = d.ph_objetivo ?? '';
        document.getElementById('automatico').value = d.automatico ? 'true' : 'false';
        document.getElementById('ip').value = d.ip || '';
        document.getElementById('formArea').classList.remove('d-none');
      };
    });

    document.querySelectorAll('.btn-delete').forEach(b => {
      b.onclick = async () => {
        if (!confirm('¿Eliminar dispositivo?')) return;
        await apiDelete(`${DISPOSITIVOS_URL}/${b.dataset.id}`);
        await renderDevices();
      };
    });

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8">Error: ${err.message}</td></tr>`;
  }
}

/* ----------------- LÓGICA CONTROL ----------------- */
let controlInterval = null;

async function initControl(){
  const select = document.getElementById('selectDevice');
  const deviceInfo = document.getElementById('deviceInfo');
  const controlsArea = document.getElementById('controlsArea');
  const btnActivarDos = document.getElementById('btnActivarDos');
  const lastRegsTbody = document.getElementById('lastRegsTbody');

  if (!select || !deviceInfo || !controlsArea || !btnActivarDos || !lastRegsTbody) return;

  async function loadDevicesToSelect(){
    const devices = await apiGet(DISPOSITIVOS_URL);
    select.innerHTML = '<option value="">-- elige --</option>';
    devices.forEach(d => {
      const opt = document.createElement('option'); 
      opt.value = d.id; 
      opt.textContent = `${d.nombre} (${d.tipo}) — ${d.ubicacion || ''}`;
      select.appendChild(opt);
    });
  }

  select.onchange = async () => {
    clearInterval(controlInterval);
    const id = select.value;
    if (!id) { 
      deviceInfo.innerHTML = ''; 
      controlsArea.classList.add('d-none'); 
      return; 
    }
    
    const d = await apiGet(`${DISPOSITIVOS_URL}/${id}`);
    deviceInfo.innerHTML = `
      <p><strong>${escapeHtml(d.nombre)}</strong> — ${escapeHtml(d.tipo)} — ${escapeHtml(d.ubicacion||'')}</p>
      <p>IP: ${escapeHtml(d.ip || 'No asignada')}</p>
      <p>pH actual: <span id="currentPh">${d.ph_actual ?? '-'}</span> — pH objetivo: <span id='targetPh'>${d.ph_objetivo ?? '-'}</span></p>
    `;
    
    controlsArea.classList.remove('d-none');
    
    // refresco cada 2s: actualizar ph y últimos registros
    async function refresh() {
      try {
        const d2 = await apiGet(`${DISPOSITIVOS_URL}/${id}`);
        document.getElementById('currentPh').textContent = d2.ph_actual ?? '-';
        document.getElementById('targetPh').textContent = d2.ph_objetivo ?? '-';
        
        // Obtener últimos 10 registros
        const regs = await apiGet(`${REGISTROS_URL}?dispositivo_id=${id}&sortBy=timestamp&order=desc&limit=10`);
        lastRegsTbody.innerHTML = '';
        regs.forEach(r => {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td>${r.ph ?? '-'}</td><td>${r.dosificador_activado ? 'Si' : 'No'}</td><td>${new Date(r.timestamp).toLocaleString()}</td>`;
          lastRegsTbody.appendChild(tr);
        });

      } catch (err) {
        console.error('refresh control err', err);
      }
    }
    
    await refresh();
    controlInterval = setInterval(refresh, 2000);
    
    // botón activar dosificador: crear un registro simulando activación
    btnActivarDos.onclick = async () => {
      try {
        // obtener el ph actual (último valor)
        const dcur = await apiGet(`${DISPOSITIVOS_URL}/${id}`);
        const payload = {
          dispositivo_id: id,
          ph: dcur.ph_actual ?? null,
          dosificador_activado: true,
          timestamp: new Date().toISOString()
        };
        await apiPost(REGISTROS_URL, payload);
        alert('Dosificador activado: se generó un registro.');
        // Refrescar también la tabla global
        refreshAllRegistros();
      } catch (err) { 
        alert('Error al activar dosificador: '+err.message); 
      }
    };
  };

  await loadDevicesToSelect();
}

/* ----------------- LÓGICA MONITOR ----------------- */
let chartInstance = null;
let monitorInterval = null;

async function initMonitor(){
  const select = document.getElementById('monitorDeviceSelect');
  const monitorLast10 = document.getElementById('monitorLast10');
  const canvas = document.getElementById('phChart');
  
  if (!select || !monitorLast10 || !canvas) return;
  
  const ctx = canvas.getContext('2d');

  async function loadDevices(){
    const devices = await apiGet(DISPOSITIVOS_URL);
    select.innerHTML = '';
    devices.forEach(d => {
      const o = document.createElement('option'); 
      o.value = d.id; 
      o.textContent = `${d.nombre} (${d.tipo})`;
      select.appendChild(o);
    });
    if (devices.length) select.value = devices[0].id;
  }

  async function refreshMonitor(){
    const id = select.value; 
    if (!id) return;
    
    try {
      const regs = await apiGet(`${REGISTROS_URL}?dispositivo_id=${id}&sortBy=timestamp&order=asc`);
      const recent = regs.slice(-100);
      const labels = recent.map(r => new Date(r.timestamp).toLocaleTimeString());
      const data = recent.map(r => r.ph ?? null);

      const last10desc = regs.slice(-10).reverse();
      monitorLast10.innerHTML = '';
      last10desc.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${r.ph ?? '-'}</td><td>${r.dosificador_activado ? 'Si' : 'No'}</td><td>${new Date(r.timestamp).toLocaleString()}</td>`;
        monitorLast10.appendChild(tr);
      });

      if (!chartInstance) {
        chartInstance = new Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              label: 'pH',
              data,
              tension: 0.3,
              fill: false,
              pointRadius: 3,
              borderColor: 'rgba(75, 192, 192, 1)',
              backgroundColor: 'rgba(75, 192, 192, 0.2)'
            }]
          },
          options: {
            responsive: true,
            scales: { y: { beginAtZero: false } }
          }
        });
      } else {
        chartInstance.data.labels = labels;
        chartInstance.data.datasets[0].data = data;
        chartInstance.update();
      }
    } catch (err) {
      console.error('Error en refreshMonitor:', err);
    }
  }

  select.onchange = async () => {
    clearInterval(monitorInterval);
    await refreshMonitor();
    monitorInterval = setInterval(refreshMonitor, 2000);
  };

  await loadDevices();
  if (select.value) {
    select.dispatchEvent(new Event('change'));
  }
}

/* ----------------- INICIALIZACIÓN GLOBAL ----------------- */
document.addEventListener('DOMContentLoaded', () => {
  // Detectar qué página estamos cargando e inicializar las funciones correspondientes
  if (document.getElementById('devicesTable')) {
    initAdmin();
  }
  
  if (document.getElementById('selectDevice')) {
    initControl();
  }
  
  if (document.getElementById('phChart')) {
    initMonitor();
  }
  
  // Iniciar alertas globales con temporizador y tabla de registros si existen
  if (document.getElementById('globalAlertContainer')) {
    startNotificationTimer(); // Usar el nuevo temporizador
  }
  
  // Iniciar polling para la tabla de todos los registros
  if (document.getElementById('allRegsTbody')) {
    startAllRegistrosPolling(); // Iniciar polling cada 2 segundos
  }
});

// Detener el polling cuando se cambia de página o se cierra la pestaña
window.addEventListener('beforeunload', () => {
  stopAllRegistrosPolling();
});