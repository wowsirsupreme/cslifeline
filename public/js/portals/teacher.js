// Teacher portal: information-dense, every figure traceable to records.
import { startPortal } from '../ui/shell.js';
import { dashboard, studentsList, studentDetail } from '../views/teacher-students.js';
import { classAnalytics, misconceptionsView, earlyWarning } from '../views/teacher-analytics.js';
import { interventionsList, interventionDetail, interventionNew } from '../views/interventions.js';
import { assessmentsList, assessmentEdit, assessmentResults } from '../views/assessments.js';
import { questionBank, questionEdit, questionImport } from '../views/questionbank.js';
import { reportsView, researchExport } from '../views/reports.js';
import { rosterView } from '../views/roster.js';
import { effectiveStatus } from '../engine/interventions.js';
import { classChips } from '../views/common.js';

startPortal({
  portal: 'teacher', allow: ['teacher', 'admin'],
  sidebarExtra: classChips,
  nav: [
    { items: [{ path: '/', label: 'Dashboard', ic: 'home' }, { path: '/students', label: 'Students', ic: 'users' }, { path: '/analytics', label: 'Class analytics', ic: 'chart' },
      { path: '/misconceptions', label: 'Misconceptions', ic: 'brain' }, { path: '/early-warning', label: 'Early warning', ic: 'alert' },
      { path: '/interventions', label: 'Interventions', ic: 'target', badge: async ({ store }) => { const c = store.myClassCodes(); if (!c.length) return 0; return (await store.listInterventions(c)).filter(i => effectiveStatus(i) === 'review_due').length; } }] },
    { group: 'Teaching', items: [{ path: '/assessments', label: 'Assessments', ic: 'clipboard' }, { path: '/questions', label: 'Question bank', ic: 'layers' }, { path: '/roster', label: 'Classes and roster', ic: 'user' }] },
    { group: 'Evidence', items: [{ path: '/reports', label: 'Reports', ic: 'file' }, { path: '/research', label: 'Research export', ic: 'db' }] },
  ],
  routes: [
    { path: '/', view: dashboard }, { path: '/students', view: studentsList }, { path: '/student/:uid', view: studentDetail },
    { path: '/analytics', view: classAnalytics }, { path: '/misconceptions', view: misconceptionsView }, { path: '/early-warning', view: earlyWarning },
    { path: '/interventions', view: interventionsList }, { path: '/interventions/new', view: interventionNew }, { path: '/intervention/:id', view: interventionDetail },
    { path: '/assessments', view: assessmentsList }, { path: '/assessment/:id/edit', view: assessmentEdit }, { path: '/assessment/:id/results', view: assessmentResults },
    { path: '/questions', view: questionBank }, { path: '/question/:id', view: questionEdit }, { path: '/questions/import', view: questionImport },
    { path: '/roster', view: rosterView }, { path: '/reports', view: reportsView }, { path: '/research', view: researchExport },
  ],
});
