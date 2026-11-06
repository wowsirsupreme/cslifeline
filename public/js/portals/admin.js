// Administrator portal: control and operational efficiency.
import { startPortal } from '../ui/shell.js';
import { adminHome, usersView, schoolsClasses, curriculumView, settingsView, modelsView, integrationsView, auditView, dataView } from '../views/admin.js';

startPortal({
  portal: 'admin', allow: ['admin'],
  nav: [
    { items: [{ path: '/', label: 'Overview', ic: 'home' }, { path: '/users', label: 'Users and roles', ic: 'users', badge: async ({ store }) => (await store.listUsers([['role', '==', 'teacher_pending']])).length }] },
    { group: 'Organisation', items: [{ path: '/schools', label: 'Schools and classes', ic: 'db' }, { path: '/curriculum', label: 'Curriculum', ic: 'book' }, { path: '/settings', label: 'Settings', ic: 'settings' }] },
    { group: 'Intelligence', items: [{ path: '/models', label: 'Models', ic: 'brain' }, { path: '/integrations', label: 'Integrations', ic: 'link' }] },
    { group: 'Governance', items: [{ path: '/audit', label: 'Audit log', ic: 'shield' }, { path: '/data', label: 'Data and privacy', ic: 'file' }] },
    { group: 'Teaching tools', items: [{ path: '/goto-teacher', label: 'Open teacher portal', ic: 'clipboard' }] },
  ],
  routes: [
    { path: '/', view: adminHome }, { path: '/users', view: usersView }, { path: '/schools', view: schoolsClasses }, { path: '/curriculum', view: curriculumView },
    { path: '/settings', view: settingsView }, { path: '/models', view: modelsView }, { path: '/integrations', view: integrationsView }, { path: '/audit', view: auditView }, { path: '/data', view: dataView },
    { path: '/goto-teacher', view: async () => { location.href = '/teacher/#/'; return document.createElement('div'); } },
  ],
});
