const API = window.API || "http://localhost:3000/api";

function normalizeEmailValue(value) {
    return value ? value.trim().toLowerCase() : '';
}

function isInstitutionalEmail(email) {
    return normalizeEmailValue(email).endsWith('@espoch.edu.ec');
}

function isGmailEmail(email) {
    return normalizeEmailValue(email).endsWith('@gmail.com');
}

let adminMap;
const driverMarkers = new Map();
let adminEmail = '';
let adminName = '';
let sessionId = '';

const driversCountEl = document.getElementById('driversCount');
const usersTableBody = document.querySelector('#usersTable tbody');
const pricingTableBody = document.querySelector('#pricingTable tbody');
const emergencyList = document.getElementById('emergencyList');
const adminContactPhoneInput = document.getElementById('adminContactPhone');
const adminNameEl = document.getElementById('adminName');
const adminEmailEl = document.getElementById('adminEmail');

function showToast(message, success = true) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.style.background = success ? 'rgba(34,197,94,0.9)' : 'rgba(239,68,68,0.85)';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
}

function baseHeaders(includeJson = true) {
    const headers = {
        'user-email': adminEmail,
        'user-role': 'administrador'
    };

    if (sessionId) {
        headers['session-id'] = sessionId;
    }

    if (includeJson) {
        headers['Content-Type'] = 'application/json';
    }

    return headers;
}

function initializeMap() {
    if (adminMap) return;

    adminMap = L.map('adminMap').setView([-1.65962, -78.67638], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(adminMap);

    loadDriverLocations();
    setInterval(loadDriverLocations, 15000);
}

function formatDriverPopup(driver) {
    const lastSeen = driver.lastUpdate
        ? new Date(driver.lastUpdate).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })
        : 'sin registro';
    const status = driver.available ? 'Disponible' : 'En viaje';
    return `<strong>${driver.name}</strong><br>${driver.email}<br>Estado: ${status}<br>Última actualización: ${lastSeen}`;
}

async function loadDriverLocations() {
    if (!adminEmail) return;
    try {
        const res = await fetch(`${API}/admin/driver-locations`, {
            headers: baseHeaders(false)
        });

        if (!res.ok) throw new Error('No se pudo obtener ubicaciones');

        const data = await res.json();
        const activeEmails = new Set();

        data.forEach(driver => {
            if (typeof driver.lat !== 'number' || typeof driver.lon !== 'number') return;
            activeEmails.add(driver.email);

            if (!driverMarkers.has(driver.email)) {
                const marker = L.circleMarker([driver.lat, driver.lon], {
                    radius: 9,
                    color: driver.available ? '#22c55e' : '#ef4444',
                    fillColor: driver.available ? '#22c55e' : '#ef4444',
                    fillOpacity: 0.9,
                    weight: 2
                }).addTo(adminMap);
                marker.bindPopup(formatDriverPopup(driver));
                driverMarkers.set(driver.email, marker);
            } else {
                const marker = driverMarkers.get(driver.email);
                marker.setLatLng([driver.lat, driver.lon]);
                marker.setStyle({
                    color: driver.available ? '#22c55e' : '#ef4444',
                    fillColor: driver.available ? '#22c55e' : '#ef4444'
                });
                marker.setPopupContent(formatDriverPopup(driver));
            }
        });

        driverMarkers.forEach((marker, email) => {
            if (!activeEmails.has(email)) {
                adminMap.removeLayer(marker);
                driverMarkers.delete(email);
            }
        });

        if (driversCountEl) {
            const count = data.length;
            driversCountEl.textContent = count === 1 ? '1 conductor' : `${count} conductores`;
        }
    } catch (error) {
        console.warn('Ubicaciones de conductores no disponibles', error);
    }
}

function renderUsers(users) {
    if (!usersTableBody) return;
    usersTableBody.innerHTML = '';

    if (!Array.isArray(users) || users.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = '<td colspan="5" class="empty-state">Sin usuarios registrados</td>';
        usersTableBody.appendChild(emptyRow);
        return;
    }

    users.forEach(user => {
        const tr = document.createElement('tr');
        tr.dataset.email = user.email;
        tr.innerHTML = `
            <td><input type="text" data-field="name" value="${user.name || ''}" /></td>
            <td>${user.email}</td>
            <td>
                <select data-field="role">
                    <option value="pasajero" ${user.role === 'pasajero' ? 'selected' : ''}>Pasajero</option>
                    <option value="conductor" ${user.role === 'conductor' ? 'selected' : ''}>Conductor</option>
                    <option value="administrador" ${user.role === 'administrador' ? 'selected' : ''}>Administrador</option>
                </select>
            </td>
            <td><input type="tel" data-field="whatsapp" value="${user.whatsapp || ''}" placeholder="WhatsApp" /></td>
            <td class="table-actions">
                <button class="submit-btn small-btn" data-action="save" data-email="${user.email}"><i class="fas fa-save"></i> Guardar</button>
                <button class="danger-btn small-btn" data-action="delete" data-email="${user.email}" ${user.email === adminEmail ? 'disabled' : ''}><i class="fas fa-trash"></i> Eliminar</button>
            </td>
        `;
        usersTableBody.appendChild(tr);
    });
}

async function loadUsers() {
    try {
        const res = await fetch(`${API}/admin/users`, { headers: baseHeaders(false) });
        if (!res.ok) throw new Error('No se pudo obtener usuarios');
        const users = await res.json();
        renderUsers(users);

        const adminData = users.find(user => user.email === adminEmail);
        if (adminData && adminContactPhoneInput) {
            adminContactPhoneInput.value = adminData.whatsapp || '';
            if (adminData.name) {
                adminNameEl.textContent = adminData.name;
            }
        }
    } catch (error) {
        renderUsers([]);
        showToast('Error al cargar usuarios', false);
    }
}

async function loadPricing() {
    try {
        const res = await fetch(`${API}/admin/pricing`, { headers: baseHeaders(false) });
        if (!res.ok) throw new Error();
        const tariffs = await res.json();

        pricingTableBody.innerHTML = '';
        if (!Array.isArray(tariffs) || tariffs.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = '<td colspan="5" class="empty-state">Sin tarifas registradas</td>';
            pricingTableBody.appendChild(emptyRow);
            return;
        }

        tariffs.forEach(tariff => {
            const tr = document.createElement('tr');
            tr.dataset.id = tariff.id;
            tr.innerHTML = `
                <td><input type="text" data-field="nombre" value="${tariff.nombre || ''}"></td>
                <td><input type="text" data-field="descripcion" value="${tariff.descripcion || ''}"></td>
                <td><input type="number" step="0.01" min="0" data-field="precio" value="${tariff.precio}"></td>
                <td>
                    <select data-field="activo">
                        <option value="true" ${tariff.activo ? 'selected' : ''}>Activo</option>
                        <option value="false" ${!tariff.activo ? 'selected' : ''}>Inactivo</option>
                    </select>
                </td>
                <td class="table-actions">
                    <button class="submit-btn small-btn" data-action="save-tariff" data-id="${tariff.id}"><i class="fas fa-save"></i> Guardar</button>
                    <button class="danger-btn small-btn" data-action="delete-tariff" data-id="${tariff.id}"><i class="fas fa-trash"></i> Eliminar</button>
                </td>
            `;
            pricingTableBody.appendChild(tr);
        });
    } catch (error) {
        pricingTableBody.innerHTML = '<tr><td colspan="5" class="empty-state">No fue posible cargar las tarifas</td></tr>';
        showToast('Error al cargar tarifas', false);
    }
}

function renderEmergencies(emergencies) {
    if (!emergencyList) return;
    emergencyList.innerHTML = '';

    if (!Array.isArray(emergencies) || emergencies.length === 0) {
        const li = document.createElement('li');
        li.className = 'empty-state';
        li.textContent = 'Sin alertas recientes';
        emergencyList.appendChild(li);
        return;
    }

    emergencies.forEach(alert => {
        const li = document.createElement('li');
        li.className = 'emergency-card';
        li.dataset.id = alert.id;
        const timestamp = alert.fecha ? new Date(alert.fecha).toLocaleString('es-EC', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: 'short'
        }) : 'N/D';

        const locationText = alert.ubicacion_lat && alert.ubicacion_lon
            ? `Lat: ${alert.ubicacion_lat.toFixed(4)}, Lon: ${alert.ubicacion_lon.toFixed(4)}`
            : 'Ubicación no disponible';

        li.innerHTML = `
            <div class="emergency-card__header">
                <span>${alert.usuario_email || 'Usuario desconocido'}</span>
                <span>${timestamp}</span>
            </div>
            <p>${alert.mensaje || 'Alerta recibida sin descripción'}</p>
            <span class="emergency-card__meta">${locationText}</span>
            <div class="emergency-card__actions">
                ${alert.ubicacion_lat && alert.ubicacion_lon ? `<button class="submit-btn small-btn" data-action="focus-map" data-lat="${alert.ubicacion_lat}" data-lon="${alert.ubicacion_lon}"><i class="fas fa-location-arrow"></i> Ver en mapa</button>` : ''}
                ${alert.atendido ? `<span class="badge" style="background: rgba(34,197,94,0.15); color: #16a34a;">Atendido por ${alert.atendido_por || 'administración'}</span>`
                : `<button class="submit-btn small-btn" data-action="resolve" data-id="${alert.id}"><i class="fas fa-check"></i> Marcar atendido</button>`}
            </div>
        `;

        emergencyList.appendChild(li);
    });
}

async function loadEmergencies() {
    try {
        const res = await fetch(`${API}/admin/emergencies`, { headers: baseHeaders(false) });
        if (!res.ok) throw new Error();
        const alerts = await res.json();
        renderEmergencies(alerts);
    } catch (error) {
        renderEmergencies([]);
        showToast('No fue posible cargar las emergencias', false);
    }
}

async function saveUserRow(button) {
    const email = button.dataset.email;
    const row = button.closest('tr');
    if (!row) return;

    const name = row.querySelector('[data-field="name"]').value.trim();
    const role = row.querySelector('[data-field="role"]').value;
    const whatsapp = row.querySelector('[data-field="whatsapp"]').value.trim();

    if (role === 'administrador' && !isGmailEmail(email)) {
        showToast('Los administradores deben usar correos Gmail', false);
        return;
    }

    try {
        const res = await fetch(`${API}/admin/users/${encodeURIComponent(email)}`, {
            method: 'PATCH',
            headers: baseHeaders(),
            body: JSON.stringify({ name, role, whatsapp })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'No se pudo actualizar');
        showToast(data.message || 'Usuario actualizado');
        loadUsers();
    } catch (error) {
        showToast(error.message || 'Error al actualizar usuario', false);
    }
}

async function deleteUserRow(button) {
    const email = button.dataset.email;
    if (!confirm(`¿Eliminar al usuario ${email}?`)) return;

    try {
        const res = await fetch(`${API}/admin/users/${encodeURIComponent(email)}`, {
            method: 'DELETE',
            headers: baseHeaders(false)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'No se pudo eliminar');
        showToast(data.message || 'Usuario eliminado');
        loadUsers();
    } catch (error) {
        showToast(error.message || 'Error al eliminar usuario', false);
    }
}

async function saveTariffRow(button) {
    const id = button.dataset.id;
    const row = button.closest('tr');
    if (!row) return;

    const nombre = row.querySelector('[data-field="nombre"]').value.trim();
    const descripcion = row.querySelector('[data-field="descripcion"]').value.trim();
    const precio = parseFloat(row.querySelector('[data-field="precio"]').value);
    const activo = row.querySelector('[data-field="activo"]').value === 'true';

    if (Number.isNaN(precio)) {
        showToast('Precio inválido', false);
        return;
    }

    try {
        const res = await fetch(`${API}/admin/pricing/${id}`, {
            method: 'PUT',
            headers: baseHeaders(),
            body: JSON.stringify({ nombre, descripcion, precio, activo })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'No se pudo actualizar');
        showToast(data.message || 'Tarifa actualizada');
        loadPricing();
    } catch (error) {
        showToast(error.message || 'Error al actualizar tarifa', false);
    }
}

async function deleteTariffRow(button) {
    const id = button.dataset.id;
    if (!confirm('¿Eliminar esta tarifa?')) return;

    try {
        const res = await fetch(`${API}/admin/pricing/${id}`, {
            method: 'DELETE',
            headers: baseHeaders(false)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'No se pudo eliminar');
        showToast(data.message || 'Tarifa eliminada');
        loadPricing();
    } catch (error) {
        showToast(error.message || 'Error al eliminar tarifa', false);
    }
}

async function resolveEmergency(id) {
    try {
        const res = await fetch(`${API}/admin/emergencies/${id}/resolve`, {
            method: 'POST',
            headers: baseHeaders(false)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'No se pudo actualizar la emergencia');
        showToast(data.message || 'Emergencia atendida');
        loadEmergencies();
    } catch (error) {
        showToast(error.message || 'Error al actualizar emergencia', false);
    }
}

function focusEmergencyOnMap(lat, lon) {
    if (!adminMap) return;
    const numericLat = parseFloat(lat);
    const numericLon = parseFloat(lon);
    if (Number.isNaN(numericLat) || Number.isNaN(numericLon)) return;

    adminMap.setView([numericLat, numericLon], 16);
    const pulseMarker = L.circleMarker([numericLat, numericLon], {
        radius: 12,
        color: '#f97316',
        fillColor: '#fb923c',
        fillOpacity: 0.8,
        weight: 2
    }).addTo(adminMap);

    setTimeout(() => {
        adminMap.removeLayer(pulseMarker);
    }, 8000);
}

async function updateAdminContact(event) {
    event.preventDefault();
    if (!adminContactPhoneInput) return;
    const whatsapp = adminContactPhoneInput.value.trim();
    try {
        const res = await fetch(`${API}/admin/users/${encodeURIComponent(adminEmail)}`, {
            method: 'PATCH',
            headers: baseHeaders(),
            body: JSON.stringify({ whatsapp })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'No se pudo actualizar el contacto');
        showToast('Contacto actualizado correctamente');
    } catch (error) {
        showToast(error.message || 'Error al actualizar contacto', false);
    }
}

async function createManualUser(event) {
    event.preventDefault();
    const name = document.getElementById('newUserName').value.trim();
    const email = document.getElementById('newUserEmail').value.trim();
    const normalizedEmail = normalizeEmailValue(email);
    const password = document.getElementById('newUserPassword').value.trim();
    const role = document.getElementById('newUserRole').value;
    const whatsapp = document.getElementById('newUserPhone').value.trim();
    const paymentMethod = document.getElementById('newUserPayment').value;

    if (!name || !normalizedEmail) {
        showToast('Nombre y correo son obligatorios', false);
        return;
    }

    if (role === 'administrador') {
        if (!isGmailEmail(email)) {
            showToast('Los administradores deben usar correos Gmail', false);
            return;
        }
    } else {
        if (!isInstitutionalEmail(email)) {
            showToast('Solo se permiten correos @espoch.edu.ec para roles no administrativos', false);
            return;
        }

        if (!password) {
            showToast('La contraseña temporal es obligatoria para este rol', false);
            return;
        }
    }

    try {
        const payload = { name, email: normalizedEmail, role, whatsapp, paymentMethod };
        if (password) {
            payload.password = password;
        }

        const res = await fetch(`${API}/admin/users`, {
            method: 'POST',
            headers: baseHeaders(),
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'No se pudo crear el usuario');
        showToast(data.message || 'Usuario creado');
        event.target.reset();
        document.getElementById('newUserRole').dispatchEvent(new Event('change'));
        loadUsers();
    } catch (error) {
        showToast(error.message || 'Error al crear usuario', false);
    }
}

function updateManualUserPasswordRequirement() {
    const roleSelect = document.getElementById('newUserRole');
    const passwordInput = document.getElementById('newUserPassword');
    if (!roleSelect || !passwordInput) return;

    if (roleSelect.value === 'administrador') {
        passwordInput.removeAttribute('required');
        passwordInput.placeholder = 'Acceso por código (opcional)';
    } else {
        passwordInput.setAttribute('required', 'required');
        passwordInput.placeholder = 'Contraseña temporal';
    }
}

async function createTariff(event) {
    event.preventDefault();
    const nombre = document.getElementById('tariffName').value.trim();
    const precio = parseFloat(document.getElementById('tariffPrice').value);
    const descripcion = document.getElementById('tariffDescription').value.trim();
    const activo = document.getElementById('tariffActive').checked;

    if (!nombre || Number.isNaN(precio)) {
        showToast('Completa los datos de la tarifa', false);
        return;
    }

    try {
        const res = await fetch(`${API}/admin/pricing`, {
            method: 'POST',
            headers: baseHeaders(),
            body: JSON.stringify({ nombre, precio, descripcion, activo })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'No se pudo guardar la tarifa');
        showToast(data.message || 'Tarifa creada');
        event.target.reset();
        document.getElementById('tariffActive').checked = true;
        loadPricing();
    } catch (error) {
        showToast(error.message || 'Error al crear tarifa', false);
    }
}

function attachEventListeners() {
    document.getElementById('createUserForm').addEventListener('submit', createManualUser);
    document.getElementById('newUserRole').addEventListener('change', updateManualUserPasswordRequirement);
    document.getElementById('createTariffForm').addEventListener('submit', createTariff);
    document.getElementById('adminContactForm').addEventListener('submit', updateAdminContact);
    document.getElementById('logoutBtn').addEventListener('click', () => {
        sessionManager.clearSession();
        window.location.href = 'Index.html';
    });
    document.getElementById('refreshUsers').addEventListener('click', loadUsers);
    document.getElementById('refreshPricing').addEventListener('click', loadPricing);
    document.getElementById('refreshEmergencies').addEventListener('click', loadEmergencies);

    usersTableBody.addEventListener('click', (event) => {
        const button = event.target.closest('button');
        if (!button) return;
        const action = button.dataset.action;
        if (action === 'save') {
            saveUserRow(button);
        }
        if (action === 'delete') {
            deleteUserRow(button);
        }
    });

    pricingTableBody.addEventListener('click', (event) => {
        const button = event.target.closest('button');
        if (!button) return;
        const action = button.dataset.action;
        if (action === 'save-tariff') {
            saveTariffRow(button);
        }
        if (action === 'delete-tariff') {
            deleteTariffRow(button);
        }
    });

    emergencyList.addEventListener('click', (event) => {
        const button = event.target.closest('button');
        if (!button) return;
        const action = button.dataset.action;
        if (action === 'resolve') {
            const id = button.dataset.id;
            resolveEmergency(id);
        }
        if (action === 'focus-map') {
            const lat = button.dataset.lat;
            const lon = button.dataset.lon;
            focusEmergencyOnMap(lat, lon);
        }
    });
}

function bootstrapAdminPanel() {
    sessionId = sessionManager.currentSessionId || sessionManager.getCurrentSessionId();
    adminEmail = sessionManager.getSessionData('userEmail');
    adminName = sessionManager.getSessionData('userName');
    const role = sessionManager.getSessionData('userRole');

    if (!adminEmail || role !== 'administrador') {
        window.location.href = 'Index.html';
        return;
    }

    if (adminName) {
        adminNameEl.textContent = adminName;
    }
    if (adminEmail) {
        adminEmailEl.textContent = adminEmail;
    }

    initializeMap();
    attachEventListeners();
    updateManualUserPasswordRequirement();
    loadUsers();
    loadPricing();
    loadEmergencies();

    setInterval(loadEmergencies, 20000);
}

document.addEventListener('DOMContentLoaded', bootstrapAdminPanel);
