/**
 * Central de Tickets - Authentication Module
 * Handles authentication state and route protection
 */

window.AUTH_CONFIG = {
    PROTECTED_PAGES: ['index.html', 'kanban.html', 'tickets-ativos.html'],
    DASHBOARD_ONLY_GESTOR: ['index.html'],
    LOGIN_PAGE: 'login.html'
};

function checkAuth() {
    const currentPage = window.location.href.split('/').pop() || 'index.html';
    const userId = localStorage.getItem('userId');
    const userRole = localStorage.getItem('userRole');
    const userEmail = localStorage.getItem('userEmail');

    if (!userId || !userEmail) {
        redirectToLogin(currentPage);
        return false;
    }

    if (window.AUTH_CONFIG.DASHBOARD_ONLY_GESTOR.includes(currentPage) && userRole !== 'gestor') {
        alert('Acesso negado! Apenas gestores podem acessar o Dashboard.');
        window.location.href = 'kanban.html';
        return false;
    }

    return { userId, userRole, userEmail };
}

function redirectToLogin(redirectPage = null) {
    let loginUrl = window.AUTH_CONFIG.LOGIN_PAGE;
    if (redirectPage && redirectPage !== window.AUTH_CONFIG.LOGIN_PAGE) {
        loginUrl += '?redirect=' + encodeURIComponent(redirectPage);
    }
    window.location.href = loginUrl;
}

function requireAuth() {
    const auth = checkAuth();
    if (!auth) {
        return null;
    }
    return auth;
}

function logout() {
    if (window._sb) {
        window._sb.auth.signOut();
    }
    
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userId');
    localStorage.removeItem('userRole');
    localStorage.removeItem('session');
    
    window.location.href = window.AUTH_CONFIG.LOGIN_PAGE;
}

function isGestor() {
    return localStorage.getItem('userRole') === 'gestor';
}

function isColab() {
    return localStorage.getItem('userRole') === 'colab';
}

function getUserEmail() {
    return localStorage.getItem('userEmail');
}

function getUserRole() {
    return localStorage.getItem('userRole');
}

function getRoleLabel() {
    const role = getUserRole();
    return role === 'gestor' ? 'Gestor' : 'Colaborador';
}

function updateUserInfo() {
    const emailEl = document.getElementById('userEmail');
    const roleEl = document.getElementById('userRole');
    
    if (emailEl) emailEl.textContent = getUserEmail();
    if (roleEl) {
        roleEl.textContent = getRoleLabel();
        roleEl.className = 'user-role ' + getUserRole();
    }
}

function hideGestorOnlyElements() {
    if (isColab()) {
        const dashboardLink = document.querySelector('a[href="index.html"]');
        if (dashboardLink) {
            dashboardLink.style.display = 'none';
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        checkAuth,
        requireAuth,
        redirectToLogin,
        logout,
        isGestor,
        isColab,
        getUserEmail,
        getUserRole,
        getRoleLabel,
        updateUserInfo,
        hideGestorOnlyElements
    };
}
