const API = "http://localhost:3000/api";

// Obtener datos del usuario
function getUserData() {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('sessionId');
    let userEmail = urlParams.get('email');
    let userRole = urlParams.get('role');
    
    if (!userEmail || !userRole) {
        const currentSessionId = sessionId || localStorage.getItem('currentSessionId');
        if (currentSessionId) {
            userEmail = localStorage.getItem(currentSessionId + '_userEmail');
            userRole = localStorage.getItem(currentSessionId + '_userRole');
        }
    }
    
    return { sessionId, userEmail, userRole };
}

const { sessionId, userEmail, userRole } = getUserData();

const profileGreetingEl = document.getElementById('profileGreeting');
const profileTripsEl = document.getElementById('profileTrips');
const profileAverageEl = document.getElementById('profileAverage');
const profileBadgeEl = document.getElementById('profileBadge');
const profileBadgeDescriptionEl = document.getElementById('profileBadgeDescription');
const preferenceInputs = document.querySelectorAll('[data-profile-pref]');
const preferenceKey = userEmail ? `profilePrefs_${userEmail}` : 'profilePrefs_guest';
let profilePreferences = {
    smartMatching: true,
    remindPayment: true,
    quietMode: false
};

function loadProfilePreferences() {
    try {
        const stored = JSON.parse(localStorage.getItem(preferenceKey));
        if (stored) {
            profilePreferences = { ...profilePreferences, ...stored };
        }
    } catch (error) {
        console.warn('No se pudieron cargar preferencias del perfil', error);
    }

    preferenceInputs.forEach(input => {
        const prefKey = input.dataset.profilePref;
        input.checked = !!profilePreferences[prefKey];
    });
}

function saveProfilePreferences() {
    localStorage.setItem(preferenceKey, JSON.stringify(profilePreferences));
}

preferenceInputs.forEach(input => {
    input.addEventListener('change', () => {
        const prefKey = input.dataset.profilePref;
        profilePreferences[prefKey] = input.checked;
        saveProfilePreferences();

        const messages = {
            smartMatching: input.checked ? 'Match inteligente activado. Priorizaremos rutas compatibles.' : 'Match inteligente desactivado.',
            remindPayment: input.checked ? 'Recordaremos tu método de pago favorito.' : 'No recordaremos tu método de pago automáticamente.',
            quietMode: input.checked ? 'Modo silencioso activo. Notificaciones discretas.' : 'Modo silencioso desactivado.'
        };
        showToast(messages[prefKey] || 'Preferencia actualizada', true);
    });
});

loadProfilePreferences();

// Mostrar notificaciones
function showToast(msg, success = true) {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.innerText = msg;
        toast.style.background = success ? "rgba(0,150,50,0.8)" : "rgba(200,0,0,0.8)";
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 3000);
    }
}

// Cargar foto de perfil
function loadProfilePhoto(email) {
    const profilePic = document.getElementById('profile-pic');
    if (profilePic && email) {
        const timestamp = new Date().getTime();
        profilePic.src = `${API}/profile/${email}/photo?t=${timestamp}`;
    }
}

// Agregar esta función
function updateRatingDisplay(rating) {
    const stars = document.querySelectorAll('.stars i');
    const ratingValue = document.getElementById('ratingValue');
    const numericRating = parseFloat(rating);

    ratingValue.textContent = numericRating.toFixed(1);
    if (profileAverageEl) {
        profileAverageEl.textContent = numericRating.toFixed(1);
    }

    stars.forEach((star, index) => {
        if (index < Math.floor(numericRating)) {
            star.className = 'fas fa-star active';
        } else if (index === Math.floor(numericRating) && numericRating % 1 > 0) {
            star.className = 'fas fa-star-half-alt active';
        } else {
            star.className = 'fas fa-star inactive';
        }
    });
}

function updateProfileBadge(totalTrips, rating, role) {
    if (!profileBadgeEl || !profileBadgeDescriptionEl) return;

    let badge = 'Explorador';
    let description = 'Sigue viajando para desbloquear nuevas insignias.';

    if (role === 'administrador') {
        badge = 'Guardian de UniRiders';
        description = 'Supervisas la seguridad y coordinas a la comunidad.';
    } else if (role === 'conductor' && totalTrips >= 20) {
        badge = 'Guía experto';
        description = 'Tu moto es referencia en la comunidad UniRiders.';
    } else if (totalTrips >= 15) {
        badge = 'Rider relámpago';
        description = 'Completaste más de 15 viajes coordinados.';
    } else if (rating >= 4.8) {
        badge = 'Favorito de la comunidad';
        description = 'Mantienes una calificación sobresaliente.';
    }

    profileBadgeEl.textContent = badge;
    profileBadgeDescriptionEl.textContent = description;
}

// Cargar datos del perfil
async function loadProfileData() {
    if (!userEmail) {
        showToast('No se encontró el email. Redirigiendo al login...', false);
        setTimeout(() => window.location.href = 'Index.html', 3000);
        return;
    }
    
    try {
        const res = await fetch(`${API}/profile/${userEmail}`);
        const data = await res.json();

        if (data.user) {
            const user = data.user;
            const vehicle = data.vehicle || {};

            // Actualizar interfaz
            document.getElementById('profileName').textContent = user.nombre || 'Usuario';
            const roleDisplayMap = {
                conductor: 'Conductor',
                pasajero: 'Pasajero',
                administrador: 'Administrador'
            };
            const roleLabel = roleDisplayMap[user.rol] || 'Pasajero';
            document.getElementById('currentRole').textContent = `Rol actual: ${roleLabel}`;
            document.getElementById('name').value = user.nombre || '';
            document.getElementById('email').value = user.email || '';
            const phoneInput = document.getElementById('contactPhone');
            if (phoneInput) {
                phoneInput.value = user.telefono_whatsapp || '';
            }

            if (profileGreetingEl) {
                const firstName = (user.nombre || '').split(' ')[0] || 'rider';
                profileGreetingEl.textContent = `Hola, ${firstName}! Ajusta tus datos cuando quieras.`;
            }

            if (profileTripsEl) {
                profileTripsEl.textContent = '0';
            }

            // Cargar foto
            loadProfilePhoto(userEmail);

            // Opciones
            document.getElementById('paymentMethod').value = user.metodo_pago_pref || 'Efectivo';
            const roleSelect = document.getElementById('roleSwitch');
            if (roleSelect) {
                roleSelect.value = user.rol || 'pasajero';
                const adminOption = roleSelect.querySelector('option[value="administrador"]');
                if (adminOption && userRole !== 'administrador') {
                    adminOption.disabled = true;
                }
            }

            // Campos de vehículo
            if (user.rol === 'conductor') {
                document.getElementById('vehicleHeader').style.display = 'block';
                document.getElementById('vehicleFields').style.display = 'block';
                document.getElementById('marca').value = vehicle.marca || '';
                document.getElementById('modelo').value = vehicle.modelo || '';
                document.getElementById('placa').value = vehicle.placa || '';
            } else {
                document.getElementById('vehicleHeader').style.display = 'none';
                document.getElementById('vehicleFields').style.display = 'none';
            }

            // Actualizar calificación
            updateRatingDisplay(user.avgRating);
            updateProfileBadge(0, parseFloat(user.avgRating || 0), user.rol || 'pasajero');

            loadProfileHistoryStats();

        } else {
            showToast(data.message || 'Error al cargar perfil', false);
        }
    } catch (err) {
        showToast('Error de conexión con el servidor', false);
    }
}

async function loadProfileHistoryStats() {
    if (!userEmail) return;

    try {
        const res = await fetch(`${API}/trips/history`, {
            headers: {
                'user-email': userEmail,
                'user-role': userRole || 'pasajero',
                'session-id': sessionId || ''
            }
        });

        if (!res.ok) return;

        const history = await res.json();
        const totalTrips = Array.isArray(history) ? history.length : 0;

        if (profileTripsEl) {
            profileTripsEl.textContent = totalTrips;
        }

        const ratingNumber = parseFloat(profileAverageEl?.textContent || '0') || 0;
        updateProfileBadge(totalTrips, ratingNumber, userRole || 'pasajero');

    } catch (error) {
        console.warn('No se pudo cargar historial para el perfil', error);
    }
}

// Manejar cambio de rol
document.getElementById('roleSwitch').addEventListener('change', (e) => {
    if (e.target.value === 'conductor') {
        document.getElementById('vehicleHeader').style.display = 'block';
        document.getElementById('vehicleFields').style.display = 'block';
    } else {
        document.getElementById('vehicleHeader').style.display = 'none';
        document.getElementById('vehicleFields').style.display = 'none';
    }

    const tripsCount = parseInt(profileTripsEl?.textContent || '0', 10) || 0;
    const currentRating = parseFloat(profileAverageEl?.textContent || '0') || 0;
    updateProfileBadge(tripsCount, currentRating, e.target.value);
});

// Manejar subida de foto
document.getElementById('photo-upload').addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('profile-pic').src = e.target.result;
        }
        reader.readAsDataURL(file);
        
        // Subir foto al servidor
        const formData = new FormData();
        formData.append('profile_photo', file);
        formData.append('email', userEmail);

        fetch(`${API}/profile/upload-photo`, {
            method: 'POST',
            body: formData 
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast('Foto actualizada correctamente', true);
            }
        })
        .catch(err => {
            showToast('Error al subir foto', false);
        });
    }
});

// Manejar envío del formulario
document.getElementById('updateProfileForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const name = document.getElementById('name').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const roleSwitchValue = document.getElementById('roleSwitch').value;
    const paymentMethodValue = document.getElementById('paymentMethod').value;
    const contactPhone = document.getElementById('contactPhone')?.value || '';

    let marca = '', modelo = '', placa = '';

    // Validar contraseñas
    if (password && password !== confirmPassword) {
        showToast('Las contraseñas no coinciden', false);
        return;
    }
    
    // Validar campos de vehículo
    if (roleSwitchValue === 'conductor') {
        marca = document.getElementById('marca').value;
        modelo = document.getElementById('modelo').value;
        placa = document.getElementById('placa').value;

        if (!marca || !modelo || !placa) {
            showToast('Faltan datos del vehículo', false);
            return;
        }
    }

    if (roleSwitchValue === 'administrador' && contactPhone.trim().length < 6) {
        showToast('El administrador debe registrar un número de contacto válido', false);
        return;
    }

    try {
        const res = await fetch(`${API}/profile/update`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'user-role': userRole || roleSwitchValue
            },
            body: JSON.stringify({
                email,
                name,
                password: password || undefined,
                rol: roleSwitchValue,
                roleSwitch: roleSwitchValue,
                paymentMethod: paymentMethodValue,
                marca,
                modelo,
                placa,
                telefono: contactPhone || undefined
            })
        });

        const data = await res.json();

        if (res.ok) {
            showToast(data.message, true);
            document.getElementById('profileName').textContent = name;
            const roleDisplayMap = {
                conductor: 'Conductor',
                pasajero: 'Pasajero',
                administrador: 'Administrador'
            };
            document.getElementById('currentRole').textContent = `Rol actual: ${roleDisplayMap[roleSwitchValue] || 'Pasajero'}`;

            // Actualizar localStorage
            if (sessionId) {
                localStorage.setItem(sessionId + '_userName', name);
                localStorage.setItem(sessionId + '_userRole', roleSwitchValue);
            }
            
            // Limpiar campos de contraseña
            document.getElementById('password').value = '';
            document.getElementById('confirmPassword').value = '';
            
        } else {
            showToast(data.message || 'Error al guardar cambios', false);
        }

    } catch (err) {
        showToast('Error de conexión con el servidor', false);
    }
});

// Botón para volver
function addBackButton() {
    if (document.getElementById('backButton')) return;
    
    const backButton = document.createElement('button');
    backButton.id = 'backButton';
    backButton.innerHTML = '← Volver';
    backButton.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        background: var(--color-azul);
        color: white;
        border: none;
        padding: 10px 15px;
        border-radius: 10px;
        cursor: pointer;
        font-weight: 600;
        z-index: 1000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;
    backButton.onclick = () => {
        if (userRole === 'conductor') {
            window.location.href = sessionId ? `conductor.html?sessionId=${sessionId}` : 'conductor.html';
        } else {
            window.location.href = sessionId ? `pasajero.html?sessionId=${sessionId}` : 'pasajero.html';
        }
    };
    document.body.appendChild(backButton);
}

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
    loadProfileData();
    addBackButton();
});