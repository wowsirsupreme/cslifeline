// js/engine/curriculum.js
// Academic hierarchy for Cambridge IGCSE Computer Science (0478).
// Chapter IDs T01–T13 are kept from v3 so that every existing response record
// stays valid. T14 (Databases) was missing in v3 and is added here.
// `syllabus` is the 0478 syllabus topic reference.
// Pure module: no DOM, no Firebase. Used by browser, Node tests and functions.

export const SUBJECTS = {
  'CS-0478': { id: 'CS-0478', title: 'Cambridge IGCSE Computer Science (0478)', curriculum: 'Cambridge IGCSE', grades: [9, 10, 11] },
};

export const CHAPTERS = {
  T01: { id: 'T01', title: 'Data Representation',          paper: 'P1', syllabus: '1',   subject: 'CS-0478', color: '#7C3AED',
         topics: ['Number systems', 'Binary arithmetic and overflow', 'Logical shifts', "Two's complement", 'Text, sound and images', 'Data storage and compression'] },
  T02: { id: 'T02', title: 'Data Transmission',            paper: 'P1', syllabus: '2',   subject: 'CS-0478', color: '#DB2777',
         topics: ['Packets and packet switching', 'Methods of transmission', 'USB', 'Error detection', 'Encryption'] },
  T03: { id: 'T03', title: 'Hardware',                      paper: 'P1', syllabus: '3',   subject: 'CS-0478', color: '#D97706',
         topics: ['Computer architecture', 'Fetch-decode-execute cycle', 'Input and output devices', 'Data storage', 'Network hardware'] },
  T04: { id: 'T04', title: 'Software',                      paper: 'P1', syllabus: '4',   subject: 'CS-0478', color: '#059669',
         topics: ['Types of software and interrupts', 'Types of programming language, translators and IDEs'] },
  T05: { id: 'T05', title: 'The Internet and its Uses',     paper: 'P1', syllabus: '5',   subject: 'CS-0478', color: '#2563EB',
         topics: ['The internet and the world wide web', 'Digital currency', 'Cyber security'] },
  T06: { id: 'T06', title: 'Automated and Emerging Technologies', paper: 'P1', syllabus: '6', subject: 'CS-0478', color: '#DC2626',
         topics: ['Automated systems', 'Robotics', 'Artificial intelligence'] },
  T07: { id: 'T07', title: 'Algorithm Design and Problem-Solving', paper: 'P2', syllabus: '7', subject: 'CS-0478', color: '#0891B2',
         topics: ['Program development life cycle', 'Decomposition', 'Validation and verification', 'Test data', 'Trace tables', 'Standard methods of solution'] },
  T08: { id: 'T08', title: 'Programming Concepts',          paper: 'P2', syllabus: '8.1', subject: 'CS-0478', color: '#4F46E5',
         topics: ['Variables and constants', 'Data types', 'Input and output', 'Sequence', 'Selection', 'Iteration', 'Totalling and counting', 'String handling', 'Operators', 'Nested statements'] },
  T09: { id: 'T09', title: 'Arrays',                        paper: 'P2', syllabus: '8.2', subject: 'CS-0478', color: '#65A30D',
         topics: ['One-dimensional arrays', 'Two-dimensional arrays'] },
  T10: { id: 'T10', title: 'Procedures and Functions',      paper: 'P2', syllabus: '8.1', subject: 'CS-0478', color: '#EA580C',
         topics: ['Procedures', 'Functions', 'Parameters', 'Local and global variables', 'Library routines'] },
  T11: { id: 'T11', title: 'File Handling',                 paper: 'P2', syllabus: '8.3', subject: 'CS-0478', color: '#0D9488',
         topics: ['Opening, reading, writing and closing files'] },
  T12: { id: 'T12', title: 'Searching and Sorting',         paper: 'P2', syllabus: '7',   subject: 'CS-0478', color: '#9333EA',
         topics: ['Linear search', 'Binary search', 'Bubble sort'] },
  T13: { id: 'T13', title: 'Boolean Logic',                 paper: 'P2', syllabus: '10',  subject: 'CS-0478', color: '#BE123C',
         topics: ['Logic gates', 'Truth tables', 'Logic expressions', 'Logic circuits'] },
  T14: { id: 'T14', title: 'Databases',                     paper: 'P2', syllabus: '9',   subject: 'CS-0478', color: '#475569',
         topics: ['Single-table databases', 'Data types', 'Primary keys', 'SQL'] },
};

export const CHAPTER_IDS = Object.keys(CHAPTERS);

export function chapterTitle(id) {
  return CHAPTERS[id]?.title || id || 'Unassigned';
}

export function chaptersForPaper(paper) {
  return CHAPTER_IDS.filter(id => CHAPTERS[id].paper === paper);
}

// Map external curriculum keys (WOW Sir topicKey, DBWOW topic id) to CS Lifeline chapters.
// Only educationally equivalent content is mapped. Anything not listed is NOT imported
// into CS Lifeline analytics (it stays in the raw integration layer).
export const EXTERNAL_TOPIC_MAP = {
  WOW_SIR: {
    'gr9-data-rep': 'T01', 'gr9-data-binary': 'T01', 'gr9-data-twos': 'T01', 'gr9-data-text': 'T01',
    'gr9-data-sound': 'T01', 'gr9-data-images': 'T01', 'gr9-data-compression': 'T01',
    'gr9-number-systems': 'T01', 'gr9-text-sound-images': 'T01', 'gr9-compression': 'T01', 'gr11-information': 'T01',
    'gr9-packet-switching': 'T02', 'gr9-data-transmission': 'T02', 'gr9-networks': 'T02', 'gr9-networking': 'T02',
    'gr11-communication': 'T02', 'gr10-data-integrity': 'T02', 'gr10-encryption': 'T02',
    'gr9-cpu': 'T03', 'gr9-memory': 'T03', 'gr9-io-devices': 'T03', 'gr9-fde': 'T03', 'gr9-storage': 'T03',
    'gr9-embedded': 'T03', 'gr11-processor': 'T03', 'gr9-ip-addresses': 'T03',
    'gr9-os': 'T04', 'gr9-languages': 'T04', 'gr11-os': 'T04', 'gr11-system-software': 'T04',
    'gr9-internet': 'T05', 'gr9-cybersec': 'T05', 'gr10-cybersecurity': 'T05', 'gr11-security': 'T05',
    'gr10-sensors': 'T06', 'gr10-robotics': 'T06', 'gr10-ai': 'T06', 'gr11-ai-advanced': 'T06',
    'gr10-abstraction': 'T07', 'gr10-algorithms': 'T07', 'gr10-system-analysis': 'T07', 'gr9-algorithms': 'T07',
    'gr11-algorithms': 'T07', 'gr10-algorithms-adv': 'T07',
    'gr9-programming': 'T08', 'gr9-prog-concepts': 'T08', 'gr9-prog-operators': 'T08', 'gr10-programming': 'T08',
    'gr10-python-adv': 'T08',
    'gr11-programming': 'T11',
    'gr9-logic': 'T13', 'gr10-boolean': 'T13', 'gr11-hardware': 'T13', 'gr11-logic': 'T13',
    'gr10-sql': 'T14', 'gr11-databases': 'T14', 'gr11-data-structures': 'T14',
  },
  DBWOW: {
    intro: 'T14', terms: 'T14', tables: 'T14', types: 'T14', pk: 'T14', fk: 'T14', rel: 'T14',
    one2one: 'T14', one2many: 'T14', many2many: 'T14', ri: 'T14', queries: 'T14', sortfilter: 'T14',
    validation: 'T14', normal: 'T14', sql: 'T14', security: 'T14',
    // 'forms', 'reports', 'interchange' are Access-application skills outside the 0478 syllabus: not mapped.
  },
};

export function mapExternalTopic(platform, key) {
  return EXTERNAL_TOPIC_MAP[platform]?.[key] || null;
}
