// URLs base de la API para los 3 dispositivos
const API_URLS = {
    oxigenador: 'https://68ca0ec3430c4476c3481f19.mockapi.io/api/v1/oxigenador',
    skimmer: 'https://68ca0ec3430c4476c3481f19.mockapi.io/api/v1/skimmer',
    dosificador: 'https://68ca11cd430c4476c3482737.mockapi.io/api/v1/dosificador'
};

// Elementos del DOM
const itemsTable = document.getElementById('itemsTable');
const alertContainer = document.getElementById('alertContainer');
const refreshBtn = document.getElementById('refreshBtn');
const itemForm = document.getElementById('itemForm');
const dispositivoSelect = document.getElementById('dispositivo');
const accionSelect = document.getElementById('accion');
const currentStatus = document.getElementById('currentStatus');
const controlPanel = document.getElementById('controlPanel');
const lastStatusInfo = document.getElementById('lastStatusInfo');
const notificacionesContainer = document.getElementById('notificacionesContainer');

// Estado de la aplicación
const appState = {
    isLoading: false,
    isOnline: true,
    lastUpdate: null,
    dispositivoActivo: 'oxigenador',
    estadosDispositivos: {
        oxigenador: 'APAGADO',
        skimmer: 'APAGADO', 
        dosificador: 'APAGADO'
    }
};

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    setupEventListeners();
    createControlButtons();
    checkConnection();
    await loadItems();
    startAutoRefresh();
}

function setupEventListeners() {
    refreshBtn.addEventListener('click', () => loadItems(true));
    itemForm.addEventListener('submit', handleFormSubmit);
    dispositivoSelect.addEventListener('change', (e) => {
        appState.dispositivoActivo = e.target.value;
        updateAccionesDispositivo();
        loadItems(true);
    });
}

function createControlButtons() {
    const buttonGroups = [
        // Oxigenador
        ['Encender Oxigenador', 'success', 'fa-wind', 'oxigenador', 'ENCENDER'],
        ['Apagar Oxigenador', 'danger', 'fa-wind', 'oxigenador', 'APAGAR'],
        ['Ajustar Oxígeno', 'primary', 'fa-sliders-h', 'oxigenador', 'AJUSTAR'],
        
        // Skimmer
        ['Encender Skimmer', 'success', 'fa-filter', 'skimmer', 'ENCENDER'],
        ['Apagar Skimmer', 'danger', 'fa-filter', 'skimmer', 'APAGAR'],
        ['Limpiar Skimmer', 'warning', 'fa-broom', 'skimmer', 'LIMPIAR'],
        
        // Dosificador
        ['Encender Dosificador', 'success', 'fa-flask', 'dosificador', 'ENCENDER'],
        ['Apagar Dosificador', 'danger', 'fa-flask', 'dosificador', 'APAGAR'],
        ['Dosificar Ahora', 'info', 'fa-tint', 'dosificador', 'DOSIFICAR']
    ];

    controlPanel.innerHTML = '';

    buttonGroups.forEach(([texto, color, icono, dispositivo, accion]) => {
        const col = document.createElement('div');
        col.className = 'col-6 col-md-4 col-lg-3 mb-3';
        
        const button = document.createElement('button');
        button.className = `btn btn-${color} w-100 control-btn`;
        button.innerHTML = `<i class="fas ${icono} me-2"></i> ${texto}`;
        button.addEventListener('click', () => {
            sendCommand(dispositivo, accion);
        });
        
        col.appendChild(button);
        controlPanel.appendChild(col);
    });
}

function updateAccionesDispositivo() {
    const acciones = {
        oxigenador: ['ENCENDER', 'APAGAR', 'AJUSTAR'],
        skimmer: ['ENCENDER', 'APAGAR', 'LIMPIAR'],
        dosificador: ['ENCENDER', 'APAGAR', 'DOSIFICAR']
    };
    
    accionSelect.innerHTML = '';
    acciones[appState.dispositivoActivo].forEach(accion => {
        const option = document.createElement('option');
        option.value = accion;
        option.textContent = accion.replace('_', ' ');
        accionSelect.appendChild(option);
    });
}

function checkConnection() {
    appState.isOnline = navigator.onLine;
    updateConnectionStatus();
}

function updateConnectionStatus() {
    const statusIndicator = document.getElementById('connectionStatus');
    if (statusIndicator) {
        statusIndicator.className = `badge ${appState.isOnline ? 'bg-success' : 'bg-danger'}`;
        statusIndicator.innerHTML = `<i class="fas ${appState.isOnline ? 'fa-wifi' : 'fa-exclamation-triangle'}"></i> ${appState.isOnline ? 'Conectado' : 'Sin conexión'}`;
    }
}

function startAutoRefresh() {
    setInterval(() => {
        if (appState.isOnline && document.visibilityState === 'visible') {
            loadItems(false);
        }
    }, 5000);
}

async function sendCommand(dispositivo, accion) {
    if (!appState.isOnline) {
        showAlert('No hay conexión a internet', 'warning');
        return;
    }

    setLoadingState(true);
    
    try {
        const formData = {
            dispositivo: dispositivo.toUpperCase(),
            accion: accion,
            fecha: new Date().toISOString(),
            estado: 'ENVIADO',
            usuario: 'Operador'
        };

        const response = await fetch(API_URLS[dispositivo], {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        if (!response.ok) throw new Error('Error al enviar comando');

        // Actualizar estado del dispositivo
        if (accion === 'ENCENDER') {
            appState.estadosDispositivos[dispositivo] = 'ENCENDIDO';
        } else if (accion === 'APAGAR') {
            appState.estadosDispositivos[dispositivo] = 'APAGADO';
        }

        showAlert(`Comando enviado: ${dispositivo} - ${accion}`, 'success');
        updateCurrentStatus(`${dispositivo.toUpperCase()}: ${accion}`);
        await loadItems(true);
        
    } catch (error) {
        console.error('Error:', error);
        showAlert('Error al enviar comando', 'danger');
    } finally {
        setLoadingState(false);
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();
    
    if (!dispositivoSelect.value || !accionSelect.value) {
        showAlert('Seleccione dispositivo y acción', 'warning');
        return;
    }
    
    await sendCommand(dispositivoSelect.value, accionSelect.value);
}

async function loadItems(forceRefresh = false) {
    if (!appState.isOnline && !forceRefresh) return;

    setLoadingState(true, true);
    
    try {
        const response = await fetch(`${API_URLS[appState.dispositivoActivo]}?sortBy=id&order=desc`);
        if (!response.ok) throw new Error('Error al cargar datos');
        
        const items = await response.json();
        const lastFiveItems = items.slice(0, 5);
        
        renderItemsTable(lastFiveItems);
        checkNotificaciones(items);
        
        appState.lastUpdate = new Date();
        updateLastUpdateTime();
        
    } catch (error) {
        console.error('Error:', error);
        showAlert('Error al cargar registros', 'danger');
    } finally {
        setLoadingState(false, true);
    }
}

function checkNotificaciones(items) {
    // Aquí puedes agregar lógica para generar notificaciones
    // basadas en los datos de los dispositivos
    const ultimoRegistro = items[0];
    if (ultimoRegistro) {
        // Ejemplo: Notificar si algún dispositivo reporta error
        if (ultimoRegistro.estado === 'ERROR') {
            showNotification(`${ultimoRegistro.dispositivo} reporta error`, 'danger');
        }
    }
}

function showNotification(mensaje, tipo) {
    const notification = document.createElement('div');
    notification.className = `alert alert-${tipo} alert-dismissible fade show`;
    notification.innerHTML = `
        <i class="fas fa-bell me-2"></i>
        ${mensaje}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    if (notificacionesContainer) {
        notificacionesContainer.appendChild(notification);
        setTimeout(() => {
            if (notification.parentNode) notification.remove();
        }, 5000);
    }
}

function renderItemsTable(items) {
    itemsTable.innerHTML = items.map(item => `
        <tr>
            <td>${item.id}</td>
            <td>
                <span class="badge bg-primary">${item.dispositivo || appState.dispositivoActivo.toUpperCase()}</span>
            </td>
            <td>
                <span class="badge 
                    ${item.accion === 'ENCENDER' ? 'bg-success' : ''}
                    ${item.accion === 'APAGAR' ? 'bg-danger' : ''}
                    ${['AJUSTAR', 'LIMPIAR', 'DOSIFICAR'].includes(item.accion) ? 'bg-warning' : ''}">
                    ${item.accion}
                </span>
            </td>
            <td>
                <span class="badge 
                    ${item.estado === 'EXITOSO' ? 'bg-success' : ''}
                    ${item.estado === 'ERROR' ? 'bg-danger' : ''}
                    ${item.estado === 'ENVIADO' ? 'bg-info' : ''}">
                    ${item.estado}
                </span>
            </td>
            <td>${formatDate(item.fecha)}</td>
            <td>${item.usuario || 'Sistema'}</td>
        </tr>
    `).join('');
}

function formatDate(dateString) {
    try {
        if (dateString) {
            const date = new Date(dateString);
            return date.toLocaleString("es-MX", {
                timeZone: "America/Mexico_City",
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        }
        return '--:--:--';
    } catch (error) {
        return '--:--:--';
    }
}

function updateCurrentStatus(status) {
    currentStatus.textContent = status;
    currentStatus.className = 'display-6';
    
    if (status.includes('ENCENDER')) currentStatus.classList.add('text-success');
    else if (status.includes('APAGAR')) currentStatus.classList.add('text-danger');
    else currentStatus.classList.add('text-info');
    
    if (lastStatusInfo) {
        lastStatusInfo.textContent = `Último comando: ${new Date().toLocaleTimeString()}`;
    }
}

function updateLastUpdateTime() {
    const lastUpdateEl = document.getElementById('lastUpdate');
    if (lastUpdateEl && appState.lastUpdate) {
        lastUpdateEl.textContent = `Actualizado: ${appState.lastUpdate.toLocaleTimeString()}`;
    }
}

function setLoadingState(isLoading, isTable = false) {
    appState.isLoading = isLoading;
    
    if (isTable && isLoading) {
        itemsTable.innerHTML = `
            <tr>
                <td colspan="6" class="text-center">
                    <div class="spinner-border spinner-border-sm" role="status">
                        <span class="visually-hidden">Cargando...</span>
                    </div>
                    Cargando...
                </td>
            </tr>
        `;
    }
}

function showAlert(message, type) {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show`;
    alert.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 
                         type === 'danger' ? 'fa-exclamation-circle' : 
                         'fa-info-circle'} me-2"></i>
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    alertContainer.appendChild(alert);
    setTimeout(() => { if (alert.parentNode) alert.remove(); }, 5000);
}