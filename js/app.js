// app.js (módulo)
// Asegúrate de servir estas páginas desde un servidor o usar Live Server.
// Reemplaza base URLs si cambian.
const API_BASE = 'https://68ccc004da4697a7f3036e64.mockapi.io/api/v1';
const DISPOSITIVOS_URL = `${API_BASE}/dispositivos`;
const REGISTROS_URL = `${API_BASE}/registros`;

/* ----------------- UTILIDADES ----------------- */
async function apiGet(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.json();
}
async function apiPost(url, body) {
  const res = await fetch(url, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  return res.json();
}
async function apiPut(url, body) {
  const res = await fetch(url, { method: 'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  return res.json();
}
async function apiDelete(url) {
  const res = await fetch(url, { method: 'DELETE' });
  return res.json();
}

/* ----------------- LÓGICA ADMIN ----------------- */
document.addEventListener('DOMContentLoaded', () => {
  if (document.body.contains(document.getElementById('devicesTable'))) initAdmin();
  if (document.body.contains(document.getElementById('selectDevice'))) initControl();
  if (document.body.contains(document.getElementById('phChart'))) initMonitor();
});

/* ---------- ADMIN ---------- */
async function initAdmin(){
  const btnNuevo = document.getElementById('btnNuevo');
  const formArea = document.getElementById('formArea');
  const deviceForm = document.getElementById('deviceForm');
  const cancelBtn = document.getElementById('cancelBtn');

  btnNuevo.onclick = ()=> {
    formArea.classList.remove('d-none');
    deviceForm.reset();
    document.getElementById('deviceId').value = '';
  };
  cancelBtn.onclick = ()=> formArea.classList.add('d-none');

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
      automatico: document.getElementById('automatico').value === 'true'
    };
    try {
      if (id) {
        await apiPut(`${DISPOSITIVOS_URL}/${id}`, payload);
      } else {
        await apiPost(DISPOSITIVOS_URL, payload);
      }
      formArea.classList.add('d-none');
      await renderDevices();
    } catch (err) { alert('Error al guardar: '+err.message) }
  };

  await renderDevices();
}

async function renderDevices(){
  const tbody = document.getElementById('devicesTbody');
  tbody.innerHTML = '<tr><td colspan="7">Cargando...</td></tr>';
  try {
    const devices = await apiGet(DISPOSITIVOS_URL);
    if (!devices.length) { tbody.innerHTML = '<tr><td colspan="7">No hay dispositivos</td></tr>'; return; }
    tbody.innerHTML = '';
    devices.forEach(d=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(d.nombre)}</td>
        <td>${escapeHtml(d.tipo)}</td>
        <td>${escapeHtml(d.ubicacion||'')}</td>
        <td>${escapeHtml(d.estado||'')}</td>
        <td>${d.ph_actual ?? '-'} / ${d.ph_objetivo ?? '-'}</td>
        <td>${d.automatico ? 'true' : 'false'}</td>
        <td>
          <button class="btn btn-sm btn-primary btn-edit" data-id="${d.id}">Editar</button>
          <button class="btn btn-sm btn-danger btn-delete" data-id="${d.id}">Borrar</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    document.querySelectorAll('.btn-edit').forEach(b=>{
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
        document.getElementById('formArea').classList.remove('d-none');
      };
    });

    document.querySelectorAll('.btn-delete').forEach(b=>{
      b.onclick = async () => {
        if (!confirm('¿Eliminar dispositivo?')) return;
        await apiDelete(`${DISPOSITIVOS_URL}/${b.dataset.id}`);
        await renderDevices();
      };
    });

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7">Error: ${err.message}</td></tr>`;
  }
}

/* ---------- CONTROL ---------- */
let controlInterval = null;
async function initControl(){
  const select = document.getElementById('selectDevice');
  const deviceInfo = document.getElementById('deviceInfo');
  const controlsArea = document.getElementById('controlsArea');
  const switchEstado = document.getElementById('switchEstado');
  const labelSwitchEstado = document.getElementById('labelSwitchEstado');
  const btnActivarDos = document.getElementById('btnActivarDos');
  const lastRegsTbody = document.getElementById('lastRegsTbody');
  const alertContainer = document.getElementById('alertContainer');

  async function loadDevicesToSelect(){
    const devices = await apiGet(DISPOSITIVOS_URL);
    select.innerHTML = '<option value="">-- elige --</option>';
    devices.forEach(d=>{
      const opt = document.createElement('option'); opt.value = d.id; opt.textContent = `${d.nombre} (${d.tipo}) — ${d.ubicacion || ''}`;
      select.appendChild(opt);
    });
  }

  select.onchange = async () => {
    clearInterval(controlInterval);
    alertContainer.innerHTML = '';
    const id = select.value;
    if (!id) { deviceInfo.innerHTML = ''; controlsArea.classList.add('d-none'); return; }
    const d = await apiGet(`${DISPOSITIVOS_URL}/${id}`);
    deviceInfo.innerHTML = `
      <p><strong>${escapeHtml(d.nombre)}</strong> — ${escapeHtml(d.tipo)} — ${escapeHtml(d.ubicacion||'')}</p>
      <p>pH actual: <span id="currentPh">${d.ph_actual ?? '-'}</span> — pH objetivo: <span id="targetPh">${d.ph_objetivo ?? '-'}</span></p>
    `;
    controlsArea.classList.remove('d-none');
    switchEstado.checked = (d.estado === 'activo');
    labelSwitchEstado.textContent = d.estado;
    // refresco cada 2s: actualizar ph y últimos registros
    async function refresh() {
      try {
        const d2 = await apiGet(`${DISPOSITIVOS_URL}/${id}`);
        document.getElementById('currentPh').textContent = d2.ph_actual ?? '-';
        document.getElementById('targetPh').textContent = d2.ph_objetivo ?? '-';
        labelSwitchEstado.textContent = d2.estado;
        // Obtener últimos 10 registros
        const regs = await apiGet(`${REGISTROS_URL}?dispositivo_id=${id}&sortBy=timestamp&order=desc&limit=10`);
        lastRegsTbody.innerHTML = '';
        regs.forEach(r=>{
          const tr = document.createElement('tr');
          tr.innerHTML = `<td>${r.ph ?? '-'}</td><td>${r.dosificador_activado ? 'Si' : 'No'}</td><td>${new Date(r.timestamp).toLocaleString()}</td>`;
          lastRegsTbody.appendChild(tr);
        });

        // alerta si ph se sale del objetivo (umbral simple: >0.3)
        if (d2.ph_actual != null && d2.ph_objetivo != null) {
          const diff = Math.abs(d2.ph_actual - d2.ph_objetivo);
          if (diff >= 0.3) {
            alertContainer.innerHTML = `<div class="alert alert-danger">pH fuera de rango (actual ${d2.ph_actual} / objetivo ${d2.ph_objetivo}). ¿Activar dosificador?</div>`;
          } else {
            alertContainer.innerHTML = `<div class="alert alert-success">pH dentro del rango.</div>`;
          }
        } else alertContainer.innerHTML = '';

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
      } catch (err) { alert('Error al activar dosificador: '+err.message); }
    };

  };

  // switch para activar/desactivar dispositivo (actualiza campo estado)
  switchEstado.onchange = async () => {
    const id = select.value; if (!id) return;
    try {
      const d = await apiGet(`${DISPOSITIVOS_URL}/${id}`);
      d.estado = switchEstado.checked ? 'activo' : 'inactivo';
      await apiPut(`${DISPOSITIVOS_URL}/${id}`, d);
      labelSwitchEstado.textContent = d.estado;
    } catch(err){ alert('Error cambiando estado:'+err.message) }
  };

  await loadDevicesToSelect();
  
}

/* ---------- MONITOR ---------- */
let chartInstance = null;
let monitorInterval = null;
async function initMonitor(){
  const select = document.getElementById('monitorDeviceSelect');
  const monitorLast10 = document.getElementById('monitorLast10');
  const ctx = document.getElementById('phChart').getContext('2d');

  async function loadDevices(){
    const devices = await apiGet(DISPOSITIVOS_URL);
    select.innerHTML = '';
    devices.forEach(d=>{
      const o = document.createElement('option'); o.value = d.id; o.textContent = `${d.nombre} (${d.tipo})`;
      select.appendChild(o);
    });
    if (devices.length) select.value = devices[0].id;
  }

  async function refreshMonitor(){
    const id = select.value; if (!id) return;
    const regs = await apiGet(`${REGISTROS_URL}?dispositivo_id=${id}&sortBy=timestamp&order=asc`);
    // generar datos (tomamos últimos 100 o menos)
    const recent = regs.slice(-100);
    const labels = recent.map(r => new Date(r.timestamp).toLocaleTimeString());
    const data = recent.map(r => r.ph ?? null);

    // actualizar tabla últimos 10 (desc)
    const last10desc = regs.slice(-10).reverse();
    monitorLast10.innerHTML = '';
    last10desc.forEach(r=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${r.ph ?? '-'}</td><td>${r.dosificador_activado ? 'Si' : 'No'}</td><td>${new Date(r.timestamp).toLocaleString()}</td>`;
      monitorLast10.appendChild(tr);
    });

    // actualizar chart (si no hay chart, crear)
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
            pointRadius: 3
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
  }

  select.onchange = async () => {
    clearInterval(monitorInterval);
    await refreshMonitor();
    monitorInterval = setInterval(refreshMonitor, 2000);
  };

  await loadDevices();
  // iniciar refresco
  select.dispatchEvent(new Event('change'));
}

/* ----------------- AUX ----------------- */
function escapeHtml(text) {
  if (text == null) return '';
  return String(text).replace(/[&<>"']/g, s=>{
    return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[s];
  });
}
