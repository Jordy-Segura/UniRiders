const API = "/api";
window.API = API;

function normalizeEmailValue(value) {
  return value ? value.trim().toLowerCase() : "";
}

function isInstitutionalEmail(email) {
  return normalizeEmailValue(email).endsWith('@espoch.edu.ec');
}

function isGmailEmail(email) {
  return normalizeEmailValue(email).endsWith('@gmail.com');
}

const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const forgotLink = document.getElementById("forgotLink");
const backToLogin = document.getElementById("backToLogin");
const toast = document.getElementById("toast");
const adminAccessLink = document.getElementById("adminAccessLink");
const backToLoginFromAdmin = document.getElementById("backToLoginFromAdmin");

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const recoverForm = document.getElementById("recoverForm");
const adminAccessForm = document.getElementById("adminAccessForm");
const sendCodeBtn = document.getElementById("sendCode");
const resetPassBtn = document.getElementById("resetPass");
const adminRequestCodeBtn = document.getElementById("adminRequestCode");
const adminVerifyCodeBtn = document.getElementById("adminVerifyCode");
const adminAccessEmailInput = document.getElementById("adminAccessEmail");
const adminAccessCodeInput = document.getElementById("adminAccessCode");

let adminAccessEmailNormalized = "";

if (adminAccessCodeInput) adminAccessCodeInput.disabled = true;
if (adminVerifyCodeBtn) adminVerifyCodeBtn.disabled = true;

function resetAdminAccessState() {
  adminAccessEmailNormalized = "";
  if (adminAccessEmailInput) {
    adminAccessEmailInput.value = "";
  }
  if (adminAccessCodeInput) {
    adminAccessCodeInput.value = "";
    adminAccessCodeInput.disabled = true;
  }
  if (adminVerifyCodeBtn) {
    adminVerifyCodeBtn.disabled = true;
  }
}


function setButtonLoading(button, isLoading, loadingText = "Procesando...") {
  if (!button) return;
  if (isLoading) {
    button.dataset.originalText = button.innerHTML;
    button.innerHTML = `<span class="loading-spinner" aria-hidden="true"></span> ${loadingText}`;
    button.setAttribute("disabled", "disabled");
  } else {
    if (button.dataset.originalText) {
      button.innerHTML = button.dataset.originalText;
      delete button.dataset.originalText;
    }
    button.removeAttribute("disabled");
  }
}

function showToast(msg, success = true) {
  toast.innerText = msg;
  toast.style.background = success ? "rgba(0,150,50,0.8)" : "rgba(200,0,0,0.8)";
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

function createSessionFromAuth(data) {
  const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem(sessionId + '_userEmail', data.userEmail);
  localStorage.setItem(sessionId + '_userName', data.userName || 'Usuario');
  localStorage.setItem(sessionId + '_userRole', data.role);
  localStorage.setItem('currentSessionId', sessionId);
  return sessionId;
}

function redirectAfterAuth(role, sessionId) {
  if (role === 'administrador') {
    window.location.href = `admin.html?sessionId=${sessionId}`;
  } else if (role === 'conductor') {
    window.location.href = `conductor.html?sessionId=${sessionId}`;
  } else {
    window.location.href = `pasajero.html?sessionId=${sessionId}`;
  }
}

// Función central para cambiar entre formularios (Estética)
function switchForm(show) {
  [loginForm, registerForm, recoverForm, adminAccessForm].forEach(f => f && f.classList.remove("active"));
  if (show === "login") loginForm.classList.add("active");
  if (show === "register") registerForm.classList.add("active");
  if (show === "recover") recoverForm.classList.add("active");
  if (show === "admin") adminAccessForm.classList.add("active");
}

// Eventos de botones de cambio
loginBtn.onclick = () => {
  loginBtn.classList.add("active");
  registerBtn.classList.remove("active");
  resetAdminAccessState();
  switchForm("login");
};

registerBtn.onclick = () => {
  registerBtn.classList.add("active");
  loginBtn.classList.remove("active");
  resetAdminAccessState();
  switchForm("register");
};

if (adminAccessLink) {
  adminAccessLink.addEventListener('click', (event) => {
    event.preventDefault();
    loginBtn.classList.remove("active");
    registerBtn.classList.remove("active");
    resetAdminAccessState();
    switchForm("admin");
    if (adminAccessEmailInput) adminAccessEmailInput.focus();
  });
}

forgotLink.onclick = () => {
    loginBtn.classList.remove("active");
    registerBtn.classList.remove("active");
    resetAdminAccessState();
    switchForm("recover");
};

backToLogin.onclick = (e) => {
    e.preventDefault();
    loginBtn.classList.add("active");
    registerBtn.classList.remove("active");
    resetAdminAccessState();
    switchForm("login");
};

if (backToLoginFromAdmin) {
  backToLoginFromAdmin.addEventListener('click', (event) => {
    event.preventDefault();
    loginBtn.classList.add("active");
    registerBtn.classList.remove("active");
    resetAdminAccessState();
    switchForm("login");
  });
}

// -----------------------------------------------------------------
// LÓGICA DE FORMS
// -----------------------------------------------------------------

// Registro con verificación
registerForm.addEventListener("submit", async e => {
  e.preventDefault();
  const name = document.getElementById("regName").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const normalizedEmail = normalizeEmailValue(email);
  const password = document.getElementById("regPassword").value.trim();
  const confirm = document.getElementById("regConfirm").value.trim();
  const role = document.querySelector('input[name="role"]:checked').value;

  if (password !== confirm) {
    showToast("Las contraseñas no coinciden", false);
    return;
  }

  // Validar correo institucional
  if (!isInstitutionalEmail(email)) {
    showToast("Solo se permiten correos institucionales @espoch.edu.ec", false);
    return;
  }

  try {
    const submitBtn = registerForm.querySelector('button[type="submit"]');
    setButtonLoading(submitBtn, true, "Creando cuenta...");
    const payload = { name, email: normalizedEmail, password, confirm, role };
    const res = await fetch(`${API}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (res.ok && data.requiresVerification) {
      // Mostrar formulario de verificación
      showVerificationForm(normalizedEmail, name, password, role);
      showToast(data.message, true);
    } else {
      showToast(data.message, res.ok);
    }

  } catch (err) {
    showToast("Error de conexión", false);
  } finally {
    const submitBtn = registerForm.querySelector('button[type="submit"]');
    setButtonLoading(submitBtn, false);
  }
});

// Función para mostrar formulario de verificación
function showVerificationForm(email, name, password, role) {
  // Crear o mostrar formulario de verificación
  let verificationForm = document.getElementById("verificationForm");
  
  if (!verificationForm) {
    verificationForm = document.createElement("form");
    verificationForm.id = "verificationForm";
    verificationForm.className = "auth-form";
    verificationForm.innerHTML = `
      <p>📧 Verifica tu correo electrónico</p>
      
      <div class="input-container">
        <i class="fas fa-envelope icon"></i>
        <input type="email" id="verifyEmail" value="${email}" readonly>
      </div>
      
      <div class="input-container">
        <i class="fas fa-key icon"></i>
        <input type="text" id="verificationCode" placeholder="Código de 6 dígitos" required maxlength="6">
      </div>
      
      <button type="submit" class="submit-btn">
        <i class="fas fa-check"></i> Verificar Cuenta
      </button>
      
      <button type="button" id="resendCode" class="submit-btn small-btn" style="background: #666; margin-top: 10px;">
        <i class="fas fa-redo"></i> Reenviar Código
      </button>
      
      <button type="button" id="backToRegister" class="forgot-link" style="text-align: center; display: block; margin-top: 15px;">
        ← Volver al registro
      </button>
    `;
    
    registerForm.parentNode.appendChild(verificationForm);
    
    // Manejar envío de verificación
    verificationForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const code = document.getElementById("verificationCode").value.trim();
      
      if (code.length !== 6) {
        showToast("El código debe tener 6 dígitos", false);
        return;
      }
      
      try {
        const res = await fetch(`${API}/verify-registration`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code })
        });
        
        const data = await res.json();
        showToast(data.message, res.ok);
        
        if (res.ok) {
          // Volver a Login si la verificación es exitosa
          setTimeout(() => {
            loginBtn.click();
            registerForm.reset();
            verificationForm.remove();
          }, 1500);
        }
      } catch (err) {
        showToast("Error de conexión", false);
      }
    });
    
    // Manejar reenvío de código
    document.getElementById("resendCode").addEventListener("click", async () => {
      try {
        const res = await fetch(`${API}/resend-verification`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email })
        });
        
        const data = await res.json();
        showToast(data.message, res.ok);
      } catch (err) {
        showToast("Error al reenviar código", false);
      }
    });
    
    // Volver al registro
    document.getElementById("backToRegister").addEventListener("click", () => {
      verificationForm.remove();
    });
  }
  
  // Mostrar formulario de verificación
  registerForm.classList.remove("active");
  verificationForm.classList.add("active");
}

// Login (MODIFICADO CON SISTEMA DE SESIONES)
loginForm.addEventListener("submit", async e => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value.trim();
  const normalizedEmail = normalizeEmailValue(email);

  try {
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    setButtonLoading(submitBtn, true, "Ingresando...");
    const res = await fetch(`${API}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail, password })
    });
    const data = await res.json();

    showToast(data.message, res.ok);

    if (res.ok) {
        if (document.getElementById("rememberMe")?.checked) {
            localStorage.setItem('rememberedEmail', normalizedEmail);
        } else {
            localStorage.removeItem('rememberedEmail');
        }

        const sessionId = createSessionFromAuth(data);
        redirectAfterAuth(data.role, sessionId);
    }

  } catch (err) {
    showToast("Error de conexión", false);
  } finally {
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    setButtonLoading(submitBtn, false);
  }
});

// Recuperar contraseña: enviar código
sendCodeBtn.addEventListener("click", async () => {
  const email = document.getElementById("recEmail").value.trim();
  if (!email) return showToast('Ingrese un correo electrónico', false);
  const normalizedEmail = normalizeEmailValue(email);

  // Validar correo institucional
  if (!isInstitutionalEmail(email)) {
    showToast("Solo se permiten correos institucionales @espoch.edu.ec", false);
    return;
  }

  try {
    setButtonLoading(sendCodeBtn, true, "Enviando...");
    const res = await fetch(`${API}/recover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail })
    });
    const data = await res.json();
    showToast(data.message, res.ok);
  } catch {
    showToast("Error al enviar código", false);
  } finally {
    setButtonLoading(sendCodeBtn, false);
  }
});

if (adminRequestCodeBtn) {
  adminRequestCodeBtn.addEventListener('click', async () => {
    if (!adminAccessEmailInput) return;
    const email = adminAccessEmailInput.value.trim();

    if (!email) {
      showToast('Ingresa el correo Gmail del administrador', false);
      return;
    }

    if (!isGmailEmail(email)) {
      showToast('Solo se permiten correos Gmail para administradores', false);
      return;
    }

    const normalizedEmail = normalizeEmailValue(email);

    try {
      setButtonLoading(adminRequestCodeBtn, true, 'Enviando...');
      const res = await fetch(`${API}/admin/request-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail })
      });

      const data = await res.json();
      showToast(data.message, res.ok);

      if (res.ok) {
        adminAccessEmailNormalized = normalizedEmail;
        if (adminAccessCodeInput) {
          adminAccessCodeInput.disabled = false;
          adminAccessCodeInput.focus();
        }
        if (adminVerifyCodeBtn) {
          adminVerifyCodeBtn.disabled = false;
        }
      }
    } catch (err) {
      showToast('Error de conexión', false);
    } finally {
      setButtonLoading(adminRequestCodeBtn, false);
    }
  });
}

if (adminVerifyCodeBtn) {
  adminVerifyCodeBtn.addEventListener('click', async () => {
    if (!adminAccessEmailNormalized) {
      showToast('Solicita un código de acceso primero', false);
      return;
    }

    const code = adminAccessCodeInput?.value.trim();
    if (!code || code.length !== 6) {
      showToast('Ingresa el código de 6 dígitos', false);
      return;
    }

    try {
      setButtonLoading(adminVerifyCodeBtn, true, 'Verificando...');
      const res = await fetch(`${API}/admin/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminAccessEmailNormalized, code })
      });

      const data = await res.json();
      showToast(data.message, res.ok);

      if (res.ok) {
        const sessionId = createSessionFromAuth(data);
        redirectAfterAuth(data.role, sessionId);
      }
    } catch (err) {
      showToast('Error de conexión', false);
    } finally {
      setButtonLoading(adminVerifyCodeBtn, false);
    }
  });
}

const legalModal = document.getElementById("legalModal");
const legalModalContent = legalModal?.querySelector("[data-legal-content]");
const legalModalClose = legalModal?.querySelector(".legal-modal__close");
const legalLinks = document.querySelectorAll(".legal-link");

const legalCopy = {
  terms: `
    <h1>Términos de Servicio</h1>
    <p>Última actualización: 20 de enero de 2026</p>
    <h2>1. Aceptación</h2>
    <p>Al crear una cuenta en UniRiders aceptas estos términos y te comprometes a respetar las normas de la comunidad ESPOCH.</p>
    <h2>2. Uso permitido</h2>
    <ul>
      <li>Usar información real y mantener tu perfil actualizado.</li>
      <li>Negociar tarifas de manera clara y respetuosa.</li>
      <li>No usar la plataforma para actividades ilegales o peligrosas.</li>
    </ul>
    <h2>3. Tarifas y pagos</h2>
    <p>Las tarifas se acuerdan entre pasajero y conductor. UniRiders no procesa pagos directos ni interviene en la negociación final.</p>
    <h2>4. Seguridad y convivencia</h2>
    <p>Todos los usuarios deben cumplir las normas de tránsito, usar casco y priorizar la seguridad. Comportamientos agresivos pueden causar suspensión.</p>
    <h2>5. Suspensión de cuentas</h2>
    <p>UniRiders puede suspender cuentas por fraude, suplantación, reportes reiterados o incumplimiento de estos términos.</p>
    <h2>6. Cambios</h2>
    <p>Podemos actualizar estos términos y notificaremos los cambios relevantes dentro de la plataforma.</p>
  `,
  privacy: `
    <h1>Política de Privacidad</h1>
    <p>Última actualización: 20 de enero de 2026</p>
    <h2>1. Información recopilada</h2>
    <p>Recolectamos datos de cuenta (nombre, correo institucional, rol), datos de viaje y mensajes necesarios para coordinar el servicio.</p>
    <h2>2. Uso de la información</h2>
    <ul>
      <li>Coordinar solicitudes, ofertas y contraofertas.</li>
      <li>Mejorar la seguridad, soporte y calidad del servicio.</li>
      <li>Generar estadísticas operativas internas.</li>
    </ul>
    <h2>3. Compartición</h2>
    <p>No vendemos tus datos. Solo compartimos información básica necesaria para completar un viaje entre pasajero y conductor.</p>
    <h2>4. Seguridad</h2>
    <p>Aplicamos medidas técnicas y organizativas para proteger tu información. Sin embargo, ningún sistema es 100% infalible.</p>
    <h2>5. Tus derechos</h2>
    <p>Puedes solicitar actualización o eliminación de tu información mediante los canales oficiales de soporte.</p>
  `
};

function openLegalModal(type) {
  if (!legalModal || !legalModalContent) return;
  legalModalContent.innerHTML = legalCopy[type] || "";
  legalModal.classList.add("is-open");
  legalModal.setAttribute("aria-hidden", "false");
}

function closeLegalModal() {
  if (!legalModal) return;
  legalModal.classList.remove("is-open");
  legalModal.setAttribute("aria-hidden", "true");
}

legalLinks.forEach(link => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const type = link.dataset.legal;
    openLegalModal(type);
  });
});

if (legalModalClose) {
  legalModalClose.addEventListener("click", closeLegalModal);
}

if (legalModal) {
  legalModal.addEventListener("click", (event) => {
    if (event.target === legalModal) closeLegalModal();
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeLegalModal();
});

// Recuperar contraseña: restablecer
resetPassBtn.addEventListener("click", async () => {
  const email = document.getElementById("recEmail").value.trim();
  const code = document.getElementById("recCode").value.trim();
  const newPassword = document.getElementById("recNewPass").value.trim();

  if (!email || !code || !newPassword) return showToast('Complete todos los campos', false);
  const normalizedEmail = normalizeEmailValue(email);

  try {
    setButtonLoading(resetPassBtn, true, "Actualizando...");
    const res = await fetch(`${API}/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail, code, newPassword })
    });
    const data = await res.json();
    showToast(data.message, res.ok);
    
    if (res.ok) {
        // Volver al login si es exitoso
        setTimeout(() => backToLogin.click(), 2000);
    }
  } catch {
    showToast("Error al restablecer contraseña", false);
  } finally {
    setButtonLoading(resetPassBtn, false);
  }
});

// Validación en tiempo real para correo permitido en registro
document.getElementById('regEmail').addEventListener('blur', function() {
  const email = this.value.trim();
  if (email && !isInstitutionalEmail(email)) {
    this.style.borderColor = 'red';
    showToast('Solo se permiten correos @espoch.edu.ec (excepto el administrador autorizado)', false);
  } else {
    this.style.borderColor = '';
  }
});

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    const rememberedEmail = localStorage.getItem('rememberedEmail');
    if (rememberedEmail) {
        document.getElementById("loginEmail").value = rememberedEmail;
        document.getElementById("rememberMe").checked = true;
    }

    switchForm('login');
    loginBtn.classList.add("active");
    resetAdminAccessState();
});
