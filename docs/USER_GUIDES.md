# User guides

## Students

**Getting in.** Go to the CS Lifeline address your teacher gives you. Choose *Join a class*, type your name, the class code from your teacher, your email and a password. No email? Your teacher can make you a login and access code; use *Student* to sign in with them.

**Home** shows what is waiting for you (assessments and practice sets from your teacher), your progress, and *Ideas worth revisiting* — topics where your recent answers suggest a short practice would help most.

**Practice.** Pick a chapter (and a difficulty), or press *Practise this idea* next to one of your ideas worth revisiting. After each answer you see whether it was right and why. Hints are there if you are stuck. Practice is for learning; it is fine to get things wrong.

**Assessments.** Open an assessment before it closes. If there is a time limit, a timer shows. Your answers are saved on your device as you go, so a dropped connection does not lose them — they are sent when you are back online (a "waiting to send" badge shows this). Results appear when your teacher has marked and released them.

**Pseudocode editor and tutorials.** Write and run Cambridge pseudocode; the tutorials walk through Paper 2 programming step by step.

**Privacy.** *Account and privacy* explains what is recorded. CS Lifeline never shows you a risk label, and it does not treat switching apps as cheating.

## Teachers

**First sign-in.** Register under *Teacher or admin → Request an account*. An administrator approves you and assigns your classes; until then you cannot see student data.

**Classes and roster.** Each class has a code. Open joining, share the code or the join link, and close joining when everyone is in. *Create student account* makes a login for a learner without email (the access code is shown once). Record research consent here from the school's paper records.

**Dashboard.** Students, activity, participation in the latest assessment, class accuracy, students who need attention (with the reason and its source for each), frequent misconceptions, difficult chapters, the weekly trend and recent submissions. Every page states which records it was computed from.

**Students → a student.** Assessment history, chapter performance, question-level answers, misconceptions with evidence, behaviour context, the early-warning indicator with its reasons, interventions and their outcomes.

**Misconceptions.** CS Lifeline reports a misconception only from repeated, consistent errors — never one wrong answer — and distinguishes *demonstrated*, *possible*, *knowledge gap*, *isolated error* and *insufficient evidence*. On a student's page, each finding shows the answers behind it; confirm or correct it there. Your decision is stored separately from the automatic result and is what everyone sees from then on.

**Early warning.** Each indicator estimates the chance that a student's assessment accuracy over the next four weeks falls below 50 %, with the main reasons and a suggested action. It is a prompt for a conversation, not a grade. When the model is a *demonstration* (trained on synthetic data), every indicator says so. With a logistic model in production, *Score with …* updates your class.

**Interventions.** *New intervention*: choose students, the target (a misconception or a chapter), the action (targeted practice set, follow-up assessment, re-teaching, conversation, activity on WOW Sir…), a review date and notes. A targeted practice set appears on the student's home page. Record observations as you go. On the review date, *Before and after* compares answers on the target in the six weeks before with answers since; completing an activity is not counted as improvement. *Record outcome* stores the evaluation as permanent evidence.

**Assessments.** *New assessment*: title, classes, opening and closing times, time limit, whether results are released automatically; add questions from the bank (filter or add a random set from a chapter); *Publish*. Students never receive the answers. Open *Results* to mark: automatic marking runs when you open the page (unless the marking service is deployed), coding and structured answers wait for your marks, and you release results. Item analysis shows each question's facility and most common wrong answer.

**Question bank.** Search and filter; open a question to edit it with a live preview. The editor validates the answer key, warns about near-duplicates and about distractors that cannot tell a misconception from a guess. *Import* takes CSV (including WOW Sir's format) or JSON, previews ready, duplicate, rejected and warning rows, and imports only what you confirm. Templates are on the import page.

**Reports.** Student, class, chapter, misconception, early-warning, intervention and progress-comparison reports, with dates and filters. *Print or save as PDF*; *Download CSV*. Leave the early-warning box unticked for reports shared with families.

**Research export.** Pseudonymised files for analysis in Python or Colab; by default only learners with recorded consent; every export is logged.

## Administrators

**Users and roles.** Approve teachers (choose school and classes), change roles, suspend, move a student to another class. Each change asks for a reason that goes into the audit log. *Erase learning data* handles deletion requests.

**Schools and classes.** Create schools and classes, set class codes, attach teachers, open or close joining.

**Curriculum.** Chapter titles and topics (IDs never change) and the misconception taxonomy with indicators, causes, strategies and evidence rules.

**Settings.** Fallback risk thresholds, whether page interruptions are recorded, consent requirement for exports, self-registration, retention period, default release of results.

**Models.** Register a model from the research pipeline (`registry_entry.json`), read its evaluation, promote it with a reason (synthetic-trained models only as demonstrations), restore an earlier one, import predictions from the production model.

**Integrations.** For each platform: status (connected / batch import / test data only / configured), counts of accepted, rejected and duplicate records, last errors, and the data-sharing authorisation. *Import a batch* runs a WOW Sir session export, a DBWOW progress export or canonical events through the adapters and shows the result before storing. The identity map is where links between platforms are verified or rejected.

**Audit log** and **Data and privacy**: every recorded action; consent overview, learners past the retention period, what is stored and why.
