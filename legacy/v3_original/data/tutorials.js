// data/tutorials.js
// Structured tutorial content for Cambridge IGCSE 0478 Paper 2 programming
// Each tutorial builds from concept → snippet → guided → full 15-mark question

export const TUTORIALS = [

// ═══════════════════════════════════════════════════════════════════
// UNIT 1 — VARIABLES, INPUT, OUTPUT
// ═══════════════════════════════════════════════════════════════════
{
  id: 'U01',
  title: 'Variables, Input & Output',
  chapter: 'T08',
  examWeight: '2–4 marks in Section A',
  summary: 'Every Cambridge program starts with declaring variables and reading/writing data. These 3 statements appear in every question.',
  color: '#6366F1',

  lessons: [
    {
      id: 'U01_L1',
      title: 'Declaring Variables',
      concept: `In Cambridge pseudocode you MUST declare every variable before using it.

The syntax is:
  DECLARE VariableName : DataType

Data types:
  INTEGER  — whole numbers (e.g. 5, -3, 100)
  REAL     — decimal numbers (e.g. 3.14, -0.5)
  STRING   — text (e.g. "Hello", "Cambridge")
  CHAR     — single character (e.g. 'A')
  BOOLEAN  — TRUE or FALSE only

Constants never change — use = not ←:
  CONSTANT MaxSize = 100`,
      snippet: `// Run this to see variable declarations in action
DECLARE Age : INTEGER
DECLARE Name : STRING
DECLARE Pi : REAL
DECLARE Pass : BOOLEAN
CONSTANT MaxScore = 100

Age ← 16
Name ← "Abena"
Pi ← 3.14159
Pass ← TRUE

OUTPUT "Name: ", Name
OUTPUT "Age: ", Age
OUTPUT "Pi: ", Pi
OUTPUT "Pass: ", Pass
OUTPUT "Max score allowed: ", MaxScore`,
      task: 'Modify the code: add a CHAR variable called Grade, set it to "A", and output it.',
      solution: `DECLARE Age : INTEGER
DECLARE Name : STRING
DECLARE Grade : CHAR
Age ← 16
Name ← "Abena"
Grade ← "A"
OUTPUT Name, " aged ", Age, " got grade: ", Grade`
    },
    {
      id: 'U01_L2',
      title: 'INPUT and OUTPUT',
      concept: `INPUT reads a value from the user into a variable.
OUTPUT displays values to the screen.

Key rules:
• Use ← for assignment (NOT =)
• String literals need double quotes: "Hello"
• Separate multiple items in OUTPUT with commas
• INPUT does NOT display a prompt automatically — add an OUTPUT first`,
      snippet: `// Run this — it will ask for your name and age
DECLARE Name : STRING
DECLARE Age : INTEGER

OUTPUT "Enter your name: "
INPUT Name
OUTPUT "Enter your age: "
INPUT Age

OUTPUT "Hello ", Name, "! You are ", Age, " years old."
OUTPUT "In 5 years you will be ", Age + 5`,
      task: 'Write a program that inputs two numbers and outputs their sum and product.',
      solution: `DECLARE Num1 : REAL
DECLARE Num2 : REAL
OUTPUT "Enter first number: "
INPUT Num1
OUTPUT "Enter second number: "
INPUT Num2
OUTPUT "Sum: ", Num1 + Num2
OUTPUT "Product: ", Num1 * Num2`
    }
  ],

  exam_question: {
    id: 'EQ_U01',
    year: '2023', paper: 'P2', marks: 15,
    context: `A weather station records daily temperatures. A program is needed to process temperature data for a week.`,
    parts: [
      {
        label: 'a',
        marks: 2,
        skill: 'Variable declaration',
        question: 'Identify and declare suitable variables to store:\n• the temperature for one day (can have decimal places)\n• the name of the day (e.g. "Monday")\n• whether the temperature is above freezing (TRUE/FALSE)',
        hint: 'Which data type handles decimals? Which handles text? Which handles true/false?',
        starter: `// Part (a) — declare your three variables here
`,
        solution: `DECLARE Temperature : REAL
DECLARE DayName : STRING
DECLARE AboveFreezing : BOOLEAN`,
        mark_scheme: ['1 mark: REAL for temperature', '1 mark: STRING for day name (BOOLEAN accepted for third variable)']
      },
      {
        label: 'b',
        marks: 3,
        skill: 'INPUT and OUTPUT with calculation',
        question: 'Write pseudocode to:\n• input a temperature reading\n• output whether it is above or below freezing\n• output the temperature converted to Fahrenheit (formula: F = C × 9/5 + 32)',
        hint: 'You need an IF statement to check if temperature > 0. Calculate Fahrenheit using the formula.',
        starter: `DECLARE Temperature : REAL
DECLARE Fahrenheit : REAL
OUTPUT "Enter temperature in Celsius: "
INPUT Temperature
// Your code here — check freezing, calculate Fahrenheit
`,
        solution: `DECLARE Temperature : REAL
DECLARE Fahrenheit : REAL
OUTPUT "Enter temperature in Celsius: "
INPUT Temperature
IF Temperature > 0 THEN
   OUTPUT "Above freezing"
ELSE
   OUTPUT "Below freezing or at freezing point"
ENDIF
Fahrenheit ← Temperature * 9 / 5 + 32
OUTPUT "In Fahrenheit: ", Fahrenheit`,
        mark_scheme: ['1 mark: correct IF condition (> 0 or >= 1)', '1 mark: correct ELSE branch', '1 mark: correct formula and OUTPUT']
      },
      {
        label: 'c',
        marks: 4,
        skill: 'FOR loop with accumulation',
        question: 'Write pseudocode to:\n• input temperatures for all 7 days of the week\n• calculate and output the weekly average\n• count and output how many days were above 30°C',
        hint: 'Use a FOR loop from 1 TO 7. Accumulate Total inside the loop. Count days above 30 with an IF inside the loop. Calculate average AFTER the loop.',
        starter: `DECLARE Temperature : REAL
DECLARE Total : REAL
DECLARE Average : REAL
DECLARE HotDays : INTEGER
DECLARE I : INTEGER
Total ← 0
HotDays ← 0
// Write your FOR loop here

// Calculate and output average and hot days count here
`,
        solution: `DECLARE Temperature : REAL
DECLARE Total : REAL
DECLARE Average : REAL
DECLARE HotDays : INTEGER
DECLARE I : INTEGER
Total ← 0
HotDays ← 0
FOR I ← 1 TO 7
   OUTPUT "Enter temperature for day ", I, ": "
   INPUT Temperature
   Total ← Total + Temperature
   IF Temperature > 30 THEN
      HotDays ← HotDays + 1
   ENDIF
NEXT I
Average ← Total / 7
OUTPUT "Weekly average: ", Average
OUTPUT "Days above 30°C: ", HotDays`,
        mark_scheme: ['1 mark: correct FOR loop 1 TO 7', '1 mark: accumulation of Total', '1 mark: IF Temperature > 30 with counter', '1 mark: correct average calculation after loop']
      },
      {
        label: 'd',
        marks: 6,
        skill: 'Arrays + finding min/max + complete algorithm',
        question: 'Write a complete program that:\n• stores temperatures for 7 days in an array\n• finds and outputs the highest and lowest temperatures\n• outputs which day number had the highest temperature\n• outputs all temperatures that were above the weekly average',
        hint: 'Declare ARRAY[1:7] OF REAL. Use a first loop to fill the array. Track highest/lowest with variables starting at the first element. Use a second loop to find max/min. Use a third loop to output above-average values.',
        starter: `DECLARE Temp : ARRAY[1:7] OF REAL
DECLARE Highest : REAL
DECLARE Lowest : REAL
DECLARE HotDay : INTEGER
DECLARE Total : REAL
DECLARE Average : REAL
DECLARE I : INTEGER
Total ← 0
// Step 1: input all temperatures into array

// Step 2: find highest, lowest, and which day was hottest

// Step 3: output temperatures above average
`,
        solution: `DECLARE Temp : ARRAY[1:7] OF REAL
DECLARE Highest : REAL
DECLARE Lowest : REAL
DECLARE HotDay : INTEGER
DECLARE Total : REAL
DECLARE Average : REAL
DECLARE I : INTEGER
Total ← 0

// Step 1: input
FOR I ← 1 TO 7
   OUTPUT "Day ", I, " temperature: "
   INPUT Temp[I]
   Total ← Total + Temp[I]
NEXT I

// Step 2: find highest, lowest
Highest ← Temp[1]
Lowest ← Temp[1]
HotDay ← 1
FOR I ← 2 TO 7
   IF Temp[I] > Highest THEN
      Highest ← Temp[I]
      HotDay ← I
   ENDIF
   IF Temp[I] < Lowest THEN
      Lowest ← Temp[I]
   ENDIF
NEXT I
Average ← Total / 7
OUTPUT "Highest: ", Highest, " on day ", HotDay
OUTPUT "Lowest: ", Lowest
OUTPUT "Above average days:"

// Step 3: above average
FOR I ← 1 TO 7
   IF Temp[I] > Average THEN
      OUTPUT "Day ", I, ": ", Temp[I]
   ENDIF
NEXT I`,
        mark_scheme: [
          '1 mark: array declaration ARRAY[1:7] OF REAL',
          '1 mark: correct input loop filling array',
          '1 mark: initialising Highest and Lowest to Temp[1] (not 0)',
          '1 mark: correct logic to update Highest and track HotDay',
          '1 mark: correct Lowest tracking',
          '1 mark: third loop correctly outputting only above-average values'
        ]
      }
    ]
  }
},

// ═══════════════════════════════════════════════════════════════════
// UNIT 2 — SELECTION (IF/CASE)
// ═══════════════════════════════════════════════════════════════════
{
  id: 'U02',
  title: 'Selection — IF and CASE OF',
  chapter: 'T08',
  examWeight: '3–5 marks in Section A or B',
  summary: 'Selection controls which path a program takes. Cambridge uses IF...THEN...ELSE...ENDIF and CASE OF...ENDCASE.',
  color: '#EC4899',

  lessons: [
    {
      id: 'U02_L1',
      title: 'IF...THEN...ELSE',
      concept: `IF condition THEN
   // runs if condition is TRUE
ELSE
   // runs if condition is FALSE
ENDIF

Rules:
• THEN is mandatory — without it, the syntax is wrong
• ENDIF is mandatory to close every IF
• You can chain: ELSE IF condition THEN
• Conditions use: > < >= <= = <>
• Combine with: AND  OR  NOT`,
      snippet: `DECLARE Score : INTEGER
DECLARE Grade : STRING
OUTPUT "Enter your score (0-100): "
INPUT Score

IF Score >= 90 THEN
   Grade ← "A"
ELSE IF Score >= 75 THEN
   Grade ← "B"
ELSE IF Score >= 60 THEN
   Grade ← "C"
ELSE IF Score >= 50 THEN
   Grade ← "D"
ELSE
   Grade ← "F"
ENDIF

OUTPUT "Score: ", Score, "  Grade: ", Grade

// Compound condition
IF Score >= 50 AND Score <= 100 THEN
   OUTPUT "Valid pass score"
ENDIF`,
      task: 'A rollercoaster allows riders if height >= 120cm AND age >= 10. Write pseudocode to input height and age, then output "Can ride" or "Cannot ride".',
      solution: `DECLARE Height : INTEGER
DECLARE Age : INTEGER
INPUT Height
INPUT Age
IF Height >= 120 AND Age >= 10 THEN
   OUTPUT "Can ride"
ELSE
   OUTPUT "Cannot ride"
ENDIF`
    },
    {
      id: 'U02_L2',
      title: 'CASE OF',
      concept: `CASE OF is cleaner than many ELSE IFs when testing one variable against multiple values.

CASE OF variable
   value1 : statement
   value2 : statement
   value1 TO value2 : statement  // range
   OTHERWISE : statement         // default
ENDCASE

Use CASE OF when:
• Testing a single variable
• Against several exact values or ranges`,
      snippet: `DECLARE DayNum : INTEGER
OUTPUT "Enter day number (1-7): "
INPUT DayNum

CASE OF DayNum
   1 : OUTPUT "Monday"
   2 : OUTPUT "Tuesday"
   3 : OUTPUT "Wednesday"
   4 : OUTPUT "Thursday"
   5 : OUTPUT "Friday"
   6 TO 7 : OUTPUT "Weekend!"
   OTHERWISE : OUTPUT "Invalid day number"
ENDCASE`,
      task: 'Use CASE OF to output the number of days in a month: January=31, February=28, April/June/Sept/Nov=30, otherwise=31.',
      solution: `DECLARE Month : INTEGER
INPUT Month
CASE OF Month
   2 : OUTPUT 28
   4, 6, 9, 11 : OUTPUT 30
   OTHERWISE : OUTPUT 31
ENDCASE`
    }
  ],

  exam_question: {
    id: 'EQ_U02',
    year: '2024', paper: 'P2', marks: 15,
    context: `A cinema ticketing system needs to calculate ticket prices. Prices depend on age category and whether it is a weekend. The categories are: Child (under 12) = $5, Teen (12–17) = $8, Adult (18–64) = $12, Senior (65+) = $7. Weekend prices add $2 to all categories.`,
    parts: [
      {
        label: 'a',
        marks: 2,
        skill: 'Problem analysis',
        question: 'State TWO inputs and TWO outputs needed by the ticket pricing system.',
        hint: 'What does the system need to know? What does it produce?',
        starter: `// List your inputs and outputs as comments:
// Input 1:
// Input 2:
// Output 1:
// Output 2:`,
        solution: `// Input 1: customer age (INTEGER)
// Input 2: whether it is a weekend (BOOLEAN or STRING "yes"/"no")
// Output 1: ticket price
// Output 2: ticket category (Child/Teen/Adult/Senior)`,
        mark_scheme: ['1 mark: any two valid inputs (age, weekend flag)', '1 mark: any two valid outputs (price, category)']
      },
      {
        label: 'b',
        marks: 3,
        skill: 'CASE OF / IF for categories',
        question: 'Write pseudocode using CASE OF or IF statements to determine and output the ticket CATEGORY (Child, Teen, Adult, Senior) based on the age entered.',
        hint: 'Use ranges: under 12 is Child, 12 TO 17 is Teen, 18 TO 64 is Adult, 65 and above is Senior. CASE OF can use TO for ranges.',
        starter: `DECLARE Age : INTEGER
DECLARE Category : STRING
OUTPUT "Enter age: "
INPUT Age
// Determine category here
`,
        solution: `DECLARE Age : INTEGER
DECLARE Category : STRING
OUTPUT "Enter age: "
INPUT Age
IF Age < 12 THEN
   Category ← "Child"
ELSE IF Age <= 17 THEN
   Category ← "Teen"
ELSE IF Age <= 64 THEN
   Category ← "Adult"
ELSE
   Category ← "Senior"
ENDIF
OUTPUT "Category: ", Category`,
        mark_scheme: ['1 mark: correct Child condition', '1 mark: correct Teen/Adult ranges', '1 mark: Senior as final else or >= 65']
      },
      {
        label: 'c',
        marks: 4,
        skill: 'Nested IF for price calculation',
        question: 'Extend your solution to calculate the correct price including the $2 weekend surcharge. Input whether it is a weekend (TRUE/FALSE). Output the final price.',
        hint: 'Set base price from category first. Then check if weekend and add 2 if so. A CASE OF on Category string works cleanly here.',
        starter: `DECLARE Age : INTEGER
DECLARE Category : STRING
DECLARE BasePrice : REAL
DECLARE FinalPrice : REAL
DECLARE IsWeekend : BOOLEAN
// Input age and weekend flag, determine category,
// set base price, apply surcharge, output final price
`,
        solution: `DECLARE Age : INTEGER
DECLARE Category : STRING
DECLARE BasePrice : REAL
DECLARE FinalPrice : REAL
DECLARE IsWeekend : BOOLEAN
OUTPUT "Enter age: "
INPUT Age
OUTPUT "Is it a weekend? (TRUE/FALSE): "
INPUT IsWeekend
IF Age < 12 THEN
   Category ← "Child"
   BasePrice ← 5
ELSE IF Age <= 17 THEN
   Category ← "Teen"
   BasePrice ← 8
ELSE IF Age <= 64 THEN
   Category ← "Adult"
   BasePrice ← 12
ELSE
   Category ← "Senior"
   BasePrice ← 7
ENDIF
IF IsWeekend THEN
   FinalPrice ← BasePrice + 2
ELSE
   FinalPrice ← BasePrice
ENDIF
OUTPUT "Category: ", Category
OUTPUT "Final price: $", FinalPrice`,
        mark_scheme: ['1 mark: all four base prices set correctly', '1 mark: IsWeekend input as BOOLEAN', '1 mark: +2 surcharge applied correctly', '1 mark: final price output']
      },
      {
        label: 'd',
        marks: 6,
        skill: 'Complete system with loop, validation, totals',
        question: 'Write a complete program for the cinema that:\n• Processes tickets for a group of customers in a loop\n• Validates that age is between 0 and 120\n• Keeps a running total of money collected\n• Counts tickets sold per category\n• Outputs a summary when the attendant types -1 to stop',
        hint: 'Use a REPEAT...UNTIL loop that stops when age = -1. Put validation in a REPEAT...UNTIL inner loop. Use four counter variables for Child/Teen/Adult/Senior counts.',
        starter: `DECLARE Age : INTEGER
DECLARE Category : STRING
DECLARE BasePrice : REAL
DECLARE FinalPrice : REAL
DECLARE IsWeekend : BOOLEAN
DECLARE TotalRevenue : REAL
DECLARE ChildCount, TeenCount, AdultCount, SeniorCount : INTEGER
TotalRevenue ← 0
ChildCount ← 0
TeenCount ← 0
AdultCount ← 0
SeniorCount ← 0
// Write your main loop here — stop on age = -1
`,
        solution: `DECLARE Age : INTEGER
DECLARE Category : STRING
DECLARE BasePrice : REAL
DECLARE FinalPrice : REAL
DECLARE IsWeekend : BOOLEAN
DECLARE TotalRevenue : REAL
DECLARE ChildCount, TeenCount, AdultCount, SeniorCount : INTEGER
TotalRevenue ← 0
ChildCount ← 0
TeenCount ← 0
AdultCount ← 0
SeniorCount ← 0
OUTPUT "Is it a weekend? (TRUE/FALSE): "
INPUT IsWeekend
REPEAT
   // Validated age input
   REPEAT
      OUTPUT "Enter age (-1 to finish): "
      INPUT Age
      IF Age <> -1 AND (Age < 0 OR Age > 120) THEN
         OUTPUT "Invalid age. Must be 0-120."
      ENDIF
   UNTIL Age = -1 OR (Age >= 0 AND Age <= 120)
   IF Age <> -1 THEN
      IF Age < 12 THEN
         Category ← "Child"
         BasePrice ← 5
         ChildCount ← ChildCount + 1
      ELSE IF Age <= 17 THEN
         Category ← "Teen"
         BasePrice ← 8
         TeenCount ← TeenCount + 1
      ELSE IF Age <= 64 THEN
         Category ← "Adult"
         BasePrice ← 12
         AdultCount ← AdultCount + 1
      ELSE
         Category ← "Senior"
         BasePrice ← 7
         SeniorCount ← SeniorCount + 1
      ENDIF
      IF IsWeekend THEN
         FinalPrice ← BasePrice + 2
      ELSE
         FinalPrice ← BasePrice
      ENDIF
      TotalRevenue ← TotalRevenue + FinalPrice
      OUTPUT Category, " ticket: $", FinalPrice
   ENDIF
UNTIL Age = -1
OUTPUT "--- Summary ---"
OUTPUT "Children: ", ChildCount
OUTPUT "Teens: ", TeenCount
OUTPUT "Adults: ", AdultCount
OUTPUT "Seniors: ", SeniorCount
OUTPUT "Total revenue: $", TotalRevenue`,
        mark_scheme: [
          '1 mark: REPEAT...UNTIL loop stopping on -1',
          '1 mark: inner validation loop for age 0–120',
          '1 mark: all four categories with correct prices',
          '1 mark: weekend surcharge applied each ticket',
          '1 mark: running total accumulated correctly',
          '1 mark: summary outputs for all four category counts'
        ]
      }
    ]
  }
},

// ═══════════════════════════════════════════════════════════════════
// UNIT 3 — LOOPS
// ═══════════════════════════════════════════════════════════════════
{
  id: 'U03',
  title: 'Loops — FOR, WHILE, REPEAT',
  chapter: 'T08',
  examWeight: '4–6 marks in Section B',
  summary: 'Loops are the most heavily tested topic in Paper 2. You must know when to use each type and be able to trace them in a table.',
  color: '#F59E0B',

  lessons: [
    {
      id: 'U03_L1',
      title: 'FOR loop — fixed count',
      concept: `Use FOR when you know EXACTLY how many times to repeat.

FOR counter ← start TO finish STEP increment
   // body
NEXT counter

• Both start and finish are INCLUSIVE
• Default STEP is 1 (you can omit it)
• STEP can be negative for counting down
• Counter variable is automatically updated each iteration`,
      snippet: `// Count up
FOR I ← 1 TO 5
   OUTPUT I
NEXT I

// Count down
OUTPUT "Countdown:"
FOR I ← 10 TO 1 STEP -1
   OUTPUT I
NEXT I
OUTPUT "Go!"

// Every other number
OUTPUT "Even numbers:"
FOR I ← 2 TO 20 STEP 2
   OUTPUT I
NEXT I`,
      task: 'Write a FOR loop that outputs the multiplication table for 7 (7×1 through 7×12), formatted as "7 × 3 = 21".',
      solution: `FOR I ← 1 TO 12
   OUTPUT "7 × ", I, " = ", 7 * I
NEXT I`
    },
    {
      id: 'U03_L2',
      title: 'WHILE loop — pre-condition',
      concept: `Use WHILE when you don't know how many times to repeat.
The condition is checked BEFORE the body runs.
If the condition is FALSE from the start, the body NEVER runs.

WHILE condition
   // body — must change something that affects condition
ENDWHILE

Common use: keep asking for valid input, processing until a sentinel value.`,
      snippet: `// Count up while under limit
DECLARE Count : INTEGER
Count ← 1
WHILE Count <= 5
   OUTPUT Count
   Count ← Count + 1
ENDWHILE

// Input validation - keep asking until valid
DECLARE Score : INTEGER
Score ← -1
WHILE Score < 0 OR Score > 100
   OUTPUT "Enter score (0-100): "
   INPUT Score
ENDWHILE
OUTPUT "Valid score: ", Score`,
      task: 'Write pseudocode using WHILE to keep reading numbers until the user enters 0, then output their sum.',
      solution: `DECLARE Num : INTEGER
DECLARE Total : INTEGER
Total ← 0
OUTPUT "Enter a number (0 to stop): "
INPUT Num
WHILE Num <> 0
   Total ← Total + Num
   OUTPUT "Enter a number (0 to stop): "
   INPUT Num
ENDWHILE
OUTPUT "Total: ", Total`
    },
    {
      id: 'U03_L3',
      title: 'REPEAT...UNTIL — post-condition',
      concept: `Use REPEAT when the body must run AT LEAST ONCE.
The condition is checked AFTER the body runs.
The loop STOPS when the condition becomes TRUE.

REPEAT
   // body always runs at least once
UNTIL condition

Most common use: menus and input that must be entered at least once.`,
      snippet: `// Simple repeat
DECLARE Count : INTEGER
Count ← 1
REPEAT
   OUTPUT Count
   Count ← Count + 1
UNTIL Count > 5

// Menu example
DECLARE Choice : INTEGER
REPEAT
   OUTPUT "1. Start game"
   OUTPUT "2. View scores"
   OUTPUT "3. Quit"
   OUTPUT "Enter choice: "
   INPUT Choice
   IF Choice = 1 THEN OUTPUT "Starting game..."
   ELSE IF Choice = 2 THEN OUTPUT "High score: 999"
   ENDIF
UNTIL Choice = 3
OUTPUT "Goodbye!"`,
      task: 'Write REPEAT...UNTIL to keep asking for a password until the user enters "Cambridge2024". Count and output the number of attempts.',
      solution: `DECLARE Password : STRING
DECLARE Attempts : INTEGER
Attempts ← 0
REPEAT
   OUTPUT "Enter password: "
   INPUT Password
   Attempts ← Attempts + 1
   IF Password <> "Cambridge2024" THEN
      OUTPUT "Wrong password"
   ENDIF
UNTIL Password = "Cambridge2024"
OUTPUT "Access granted after ", Attempts, " attempt(s)"`
    }
  ],

  exam_question: {
    id: 'EQ_U03',
    year: '2024', paper: 'P2', marks: 15,
    context: `A supermarket loyalty card system gives customers points on purchases. Customers earn 1 point per $1 spent. Every 100 points can be redeemed for $5 off. The system processes multiple transactions per customer visit and then produces a receipt.`,
    parts: [
      {
        label: 'a',
        marks: 2,
        skill: 'Trace table',
        question: 'Complete the trace table for this pseudocode when the inputs are: 25, 60, 40.\n\nTotal ← 0\nPoints ← 0\nFOR I ← 1 TO 3\n   INPUT Amount\n   Total ← Total + Amount\n   Points ← Points + INT(Amount)\nNEXT I\nOUTPUT Total, Points',
        hint: 'Trace each iteration. INT() rounds down to whole number.',
        starter: `// Trace the algorithm above — predict the final values of Total and Points
// Then run this code to verify:
DECLARE Total : REAL
DECLARE Points : INTEGER
DECLARE Amount : REAL
DECLARE I : INTEGER
Total ← 0
Points ← 0
FOR I ← 1 TO 3
   INPUT Amount
   Total ← Total + Amount
   Points ← Points + INT(Amount)
NEXT I
OUTPUT "Total spent: $", Total
OUTPUT "Points earned: ", Points`,
        solution: `DECLARE Total : REAL
DECLARE Points : INTEGER
DECLARE Amount : REAL
DECLARE I : INTEGER
Total ← 0
Points ← 0
FOR I ← 1 TO 3
   INPUT Amount
   Total ← Total + Amount
   Points ← Points + INT(Amount)
NEXT I
OUTPUT "Total spent: $", Total
OUTPUT "Points earned: ", Points
// Expected: Total=125, Points=125`,
        mark_scheme: ['1 mark: Total = 125', '1 mark: Points = 125']
      },
      {
        label: 'b',
        marks: 3,
        skill: 'WHILE loop with sentinel',
        question: 'Write pseudocode using a WHILE loop to:\n• read purchase amounts until the cashier enters -1\n• accumulate a running total\n• count the number of items purchased',
        hint: 'Read one amount BEFORE the loop starts (priming read). Check for -1 in the WHILE condition. Do NOT add -1 to the total.',
        starter: `DECLARE Amount : REAL
DECLARE Total : REAL
DECLARE ItemCount : INTEGER
Total ← 0
ItemCount ← 0
// Priming read
OUTPUT "Enter amount (-1 when done): "
INPUT Amount
// Write WHILE loop here
`,
        solution: `DECLARE Amount : REAL
DECLARE Total : REAL
DECLARE ItemCount : INTEGER
Total ← 0
ItemCount ← 0
OUTPUT "Enter amount (-1 when done): "
INPUT Amount
WHILE Amount <> -1
   Total ← Total + Amount
   ItemCount ← ItemCount + 1
   OUTPUT "Enter amount (-1 when done): "
   INPUT Amount
ENDWHILE
OUTPUT "Items: ", ItemCount
OUTPUT "Total: $", Total`,
        mark_scheme: ['1 mark: priming read before loop', '1 mark: WHILE Amount <> -1', '1 mark: INPUT inside loop (reading next value)']
      },
      {
        label: 'c',
        marks: 4,
        skill: 'Points and redemption calculation',
        question: 'Extend your solution. After all purchases:\n• calculate points earned (1 point per whole dollar)\n• calculate how many $5 discounts can be redeemed (100 points = $5)\n• calculate remaining points after redemption\n• output a receipt showing total, points, discounts, and amount to pay',
        hint: 'Use DIV to find how many complete 100s fit. Use MOD for the remainder. Amount to pay = Total - (discounts × 5).',
        starter: `// Assume Total and ItemCount are already calculated from part (b)
DECLARE Total : REAL
DECLARE Points : INTEGER
DECLARE Discounts : INTEGER
DECLARE RemainingPoints : INTEGER
DECLARE AmountToPay : REAL
Total ← 125.50  // example value for testing
// Calculate points, discounts, remaining, amount to pay
`,
        solution: `DECLARE Total : REAL
DECLARE Points : INTEGER
DECLARE Discounts : INTEGER
DECLARE RemainingPoints : INTEGER
DECLARE AmountToPay : REAL
Total ← 125.50
Points ← INT(Total)
Discounts ← Points DIV 100
RemainingPoints ← Points MOD 100
AmountToPay ← Total - (Discounts * 5)
OUTPUT "--- Receipt ---"
OUTPUT "Total purchases: $", Total
OUTPUT "Points earned: ", Points
OUTPUT "Discounts applied: ", Discounts, " x $5 = $", Discounts * 5
OUTPUT "Points remaining: ", RemainingPoints
OUTPUT "Amount to pay: $", AmountToPay`,
        mark_scheme: ['1 mark: Points ← INT(Total) or equivalent', '1 mark: DIV 100 for discount count', '1 mark: MOD 100 for remaining points', '1 mark: correct AmountToPay formula']
      },
      {
        label: 'd',
        marks: 6,
        skill: 'Complete system with stored history',
        question: 'Write a complete loyalty card system that:\n• stores amounts for up to 20 purchases in an array\n• uses a REPEAT loop for the main transaction entry\n• validates that each amount is > 0 (re-prompts if not)\n• after entry, outputs all individual purchase amounts\n• finds and outputs the largest single purchase\n• calculates the full receipt from part (c)',
        hint: 'Declare ARRAY[1:20] OF REAL. Use a counter to track how many items entered. Find maximum by initialising Max to first element then looping from index 2.',
        starter: `DECLARE Purchases : ARRAY[1:20] OF REAL
DECLARE Amount : REAL
DECLARE Count : INTEGER
DECLARE Max : REAL
DECLARE Total : REAL
Count ← 0
Total ← 0
// Step 1: REPEAT loop to fill array (stop on -1, max 20)

// Step 2: output all purchases and find maximum

// Step 3: full receipt (points, discounts, pay)
`,
        solution: `DECLARE Purchases : ARRAY[1:20] OF REAL
DECLARE Amount : REAL
DECLARE Count : INTEGER
DECLARE Max : REAL
DECLARE Total : REAL
DECLARE Points : INTEGER
DECLARE Discounts : INTEGER
DECLARE I : INTEGER
Count ← 0
Total ← 0
REPEAT
   REPEAT
      OUTPUT "Enter amount (-1 to finish): "
      INPUT Amount
      IF Amount <> -1 AND Amount <= 0 THEN
         OUTPUT "Amount must be greater than 0"
      ENDIF
   UNTIL Amount = -1 OR Amount > 0
   IF Amount <> -1 THEN
      Count ← Count + 1
      Purchases[Count] ← Amount
      Total ← Total + Amount
   ENDIF
UNTIL Amount = -1 OR Count = 20
OUTPUT "--- Purchases ---"
Max ← Purchases[1]
FOR I ← 1 TO Count
   OUTPUT "Purchase ", I, ": $", Purchases[I]
   IF Purchases[I] > Max THEN
      Max ← Purchases[I]
   ENDIF
NEXT I
OUTPUT "Largest purchase: $", Max
Points ← INT(Total)
Discounts ← Points DIV 100
OUTPUT "--- Receipt ---"
OUTPUT "Items: ", Count
OUTPUT "Total: $", Total
OUTPUT "Points earned: ", Points
OUTPUT "Discounts ($5 each): ", Discounts
OUTPUT "Amount to pay: $", Total - (Discounts * 5)`,
        mark_scheme: [
          '1 mark: ARRAY[1:20] declared and used correctly',
          '1 mark: REPEAT outer loop stopping on -1 or Count=20',
          '1 mark: inner validation loop rejecting Amount ≤ 0',
          '1 mark: array filled and Count maintained',
          '1 mark: Max found correctly (initialised to first element)',
          '1 mark: complete correct receipt output'
        ]
      }
    ]
  }
},

// ═══════════════════════════════════════════════════════════════════
// UNIT 4 — PROCEDURES & FUNCTIONS
// ═══════════════════════════════════════════════════════════════════
{
  id: 'U04',
  title: 'Procedures & Functions',
  chapter: 'T10',
  examWeight: '4–6 marks in Section B',
  summary: 'Modular programming breaks code into reusable blocks. Procedures DO things; Functions RETURN values. This distinction is heavily tested.',
  color: '#10B981',

  lessons: [
    {
      id: 'U04_L1',
      title: 'Procedures',
      concept: `PROCEDURE Name(param1 : TYPE, param2 : TYPE)
   // body — does something but returns nothing
ENDPROCEDURE

Call with:  CALL Name(argument1, argument2)

Parameters can be BYVAL (default, copy) or BYREF (modifies original).
Local variables inside a procedure cannot be accessed outside.`,
      snippet: `// A procedure to display a formatted heading
PROCEDURE PrintHeading(Title : STRING, Width : INTEGER)
   DECLARE Line : STRING
   DECLARE I : INTEGER
   Line ← ""
   FOR I ← 1 TO Width
      Line ← Line & "-"
   NEXT I
   OUTPUT Line
   OUTPUT Title
   OUTPUT Line
ENDPROCEDURE

CALL PrintHeading("Student Report", 20)
CALL PrintHeading("CS Lifeline", 15)`,
      task: 'Write a procedure called Greet that takes a name and score as parameters and outputs a personalised message like "Well done Abena! You scored 87/100".',
      solution: `PROCEDURE Greet(Name : STRING, Score : INTEGER)
   OUTPUT "Well done ", Name, "! You scored ", Score, "/100"
ENDPROCEDURE

CALL Greet("Abena", 87)
CALL Greet("Kofi", 72)`
    },
    {
      id: 'U04_L2',
      title: 'Functions',
      concept: `FUNCTION Name(params) RETURNS DataType
   // body
   RETURN value
ENDFUNCTION

Call by using the function IN an expression:
  Result ← FunctionName(arguments)
  OUTPUT FunctionName(arguments)

Key differences from procedure:
• Uses RETURNS keyword in header
• Must have RETURN statement in body  
• Called inside an expression, not with CALL`,
      snippet: `FUNCTION Maximum(A : INTEGER, B : INTEGER) RETURNS INTEGER
   IF A > B THEN
      RETURN A
   ELSE
      RETURN B
   ENDIF
ENDFUNCTION

FUNCTION Celsius_To_Fahrenheit(C : REAL) RETURNS REAL
   RETURN C * 9 / 5 + 32
ENDFUNCTION

FUNCTION IsEven(N : INTEGER) RETURNS BOOLEAN
   RETURN N MOD 2 = 0
ENDFUNCTION

// Using the functions
OUTPUT "Max of 15 and 23: ", Maximum(15, 23)
OUTPUT "100°C in Fahrenheit: ", Celsius_To_Fahrenheit(100)
OUTPUT "Is 42 even? ", IsEven(42)
OUTPUT "Is 17 even? ", IsEven(17)`,
      task: 'Write a function called Grade that takes a score (0-100) and returns "A" (>=90), "B" (>=75), "C" (>=60), "D" (>=50), or "F". Test it with several scores.',
      solution: `FUNCTION Grade(Score : INTEGER) RETURNS STRING
   IF Score >= 90 THEN
      RETURN "A"
   ELSE IF Score >= 75 THEN
      RETURN "B"
   ELSE IF Score >= 60 THEN
      RETURN "C"
   ELSE IF Score >= 50 THEN
      RETURN "D"
   ELSE
      RETURN "F"
   ENDIF
ENDFUNCTION

OUTPUT Grade(95)
OUTPUT Grade(82)
OUTPUT Grade(61)
OUTPUT Grade(45)`
    }
  ],

  exam_question: {
    id: 'EQ_U04',
    year: '2023', paper: 'P2', marks: 15,
    context: `A school wants a program to manage student assessment results. Students take three tests and receive an overall grade. The program should use procedures and functions for modularity.`,
    parts: [
      {
        label: 'a',
        marks: 2,
        skill: 'Identify procedure vs function',
        question: 'For each task below, state whether a PROCEDURE or FUNCTION is most appropriate and explain why:\n(i) Calculate and RETURN the average of three test scores\n(ii) Display a formatted student report on screen',
        hint: 'A function returns a value. A procedure performs an action without returning a value.',
        starter: `// Answer as comments:
// (i) Average of three scores → PROCEDURE or FUNCTION? Why?
// (ii) Display formatted report → PROCEDURE or FUNCTION? Why?

// Then run this to experiment:
FUNCTION Average3(A : REAL, B : REAL, C : REAL) RETURNS REAL
   RETURN (A + B + C) / 3
ENDFUNCTION
OUTPUT Average3(72, 85, 91)`,
        solution: `// (i) FUNCTION — because it calculates and returns a value (the average)
//     that will be used elsewhere in the program
// (ii) PROCEDURE — because it performs an action (displaying output)
//      and does not need to return a value to the calling code

FUNCTION Average3(A : REAL, B : REAL, C : REAL) RETURNS REAL
   RETURN (A + B + C) / 3
ENDFUNCTION
OUTPUT Average3(72, 85, 91)`,
        mark_scheme: ['1 mark: FUNCTION for average with reason (returns a value)', '1 mark: PROCEDURE for display with reason (performs action, no return)']
      },
      {
        label: 'b',
        marks: 3,
        skill: 'Write a function',
        question: 'Write a FUNCTION called CalcAverage that:\n• takes three INTEGER parameters: Score1, Score2, Score3\n• returns the average as a REAL\n• Test it by calling it with scores 65, 78, 83',
        hint: 'Add all three, divide by 3. Make sure RETURNS type is REAL. Use the function in an OUTPUT statement.',
        starter: `// Write your CalcAverage function here

`,
        solution: `FUNCTION CalcAverage(Score1 : INTEGER, Score2 : INTEGER, Score3 : INTEGER) RETURNS REAL
   RETURN (Score1 + Score2 + Score3) / 3
ENDFUNCTION

OUTPUT "Average: ", CalcAverage(65, 78, 83)`,
        mark_scheme: ['1 mark: correct function header with RETURNS REAL', '1 mark: correct calculation (sum / 3)', '1 mark: RETURN statement present and correct']
      },
      {
        label: 'c',
        marks: 4,
        skill: 'Write a procedure with parameters',
        question: 'Write a PROCEDURE called DisplayReport that:\n• takes Name (STRING) and three scores (INTEGER) as parameters\n• calls CalcAverage to get the average\n• outputs the student name, all three scores, the average\n• outputs the letter grade (A≥90, B≥75, C≥60, D≥50, F otherwise)',
        hint: 'You can call CalcAverage inside the procedure. Use Average ← CalcAverage(s1, s2, s3). Then use IF/ELSE IF to determine the grade.',
        starter: `FUNCTION CalcAverage(Score1 : INTEGER, Score2 : INTEGER, Score3 : INTEGER) RETURNS REAL
   RETURN (Score1 + Score2 + Score3) / 3
ENDFUNCTION

PROCEDURE DisplayReport(Name : STRING, S1 : INTEGER, S2 : INTEGER, S3 : INTEGER)
   DECLARE Average : REAL
   DECLARE Grade : STRING
   Average ← CalcAverage(S1, S2, S3)
   // Determine grade and output report here
ENDPROCEDURE

CALL DisplayReport("Abena", 82, 75, 91)`,
        solution: `FUNCTION CalcAverage(S1 : INTEGER, S2 : INTEGER, S3 : INTEGER) RETURNS REAL
   RETURN (S1 + S2 + S3) / 3
ENDFUNCTION

PROCEDURE DisplayReport(Name : STRING, S1 : INTEGER, S2 : INTEGER, S3 : INTEGER)
   DECLARE Average : REAL
   DECLARE Grade : STRING
   Average ← CalcAverage(S1, S2, S3)
   IF Average >= 90 THEN
      Grade ← "A"
   ELSE IF Average >= 75 THEN
      Grade ← "B"
   ELSE IF Average >= 60 THEN
      Grade ← "C"
   ELSE IF Average >= 50 THEN
      Grade ← "D"
   ELSE
      Grade ← "F"
   ENDIF
   OUTPUT "Student: ", Name
   OUTPUT "Scores: ", S1, " | ", S2, " | ", S3
   OUTPUT "Average: ", Average
   OUTPUT "Grade: ", Grade
ENDPROCEDURE

CALL DisplayReport("Abena", 82, 75, 91)
CALL DisplayReport("Kofi", 45, 52, 48)`,
        mark_scheme: ['1 mark: CalcAverage called correctly inside procedure', '1 mark: all five grade boundaries correct', '1 mark: all required outputs present', '1 mark: procedure called correctly in main program']
      },
      {
        label: 'd',
        marks: 6,
        skill: 'Complete modular system',
        question: 'Write a complete program that:\n• processes multiple students in a loop (stop when name = "done")\n• for each student: inputs name and three scores\n• validates each score is 0–100 using a FUNCTION called IsValid\n• stores all averages in an array (up to 50 students)\n• after all students, calls a PROCEDURE called ClassSummary that outputs: total students, class average, highest average, lowest average',
        hint: 'IsValid(score) returns BOOLEAN. Validate each score with a WHILE or REPEAT loop. ClassSummary takes the array and count as parameters.',
        starter: `// Step 1: write IsValid function
// Step 2: write CalcAverage function  
// Step 3: write ClassSummary procedure
// Step 4: write main program loop

DECLARE Averages : ARRAY[1:50] OF REAL
DECLARE StudentCount : INTEGER
StudentCount ← 0
`,
        solution: `FUNCTION IsValid(Score : INTEGER) RETURNS BOOLEAN
   RETURN Score >= 0 AND Score <= 100
ENDFUNCTION

FUNCTION CalcAverage(S1 : INTEGER, S2 : INTEGER, S3 : INTEGER) RETURNS REAL
   RETURN (S1 + S2 + S3) / 3
ENDFUNCTION

PROCEDURE ClassSummary(Avgs : ARRAY[1:50] OF REAL, Count : INTEGER)
   DECLARE Total : REAL
   DECLARE Highest : REAL
   DECLARE Lowest : REAL
   DECLARE I : INTEGER
   Total ← 0
   Highest ← Avgs[1]
   Lowest ← Avgs[1]
   FOR I ← 1 TO Count
      Total ← Total + Avgs[I]
      IF Avgs[I] > Highest THEN Highest ← Avgs[I] ENDIF
      IF Avgs[I] < Lowest  THEN Lowest  ← Avgs[I] ENDIF
   NEXT I
   OUTPUT "--- Class Summary ---"
   OUTPUT "Students: ", Count
   OUTPUT "Class average: ", Total / Count
   OUTPUT "Highest average: ", Highest
   OUTPUT "Lowest average: ", Lowest
ENDPROCEDURE

DECLARE Averages : ARRAY[1:50] OF REAL
DECLARE Name : STRING
DECLARE S1, S2, S3 : INTEGER
DECLARE StudentCount : INTEGER
StudentCount ← 0
REPEAT
   OUTPUT "Enter student name (done to finish): "
   INPUT Name
   IF Name <> "done" THEN
      REPEAT
         OUTPUT "Score 1: "
         INPUT S1
      UNTIL IsValid(S1)
      REPEAT
         OUTPUT "Score 2: "
         INPUT S2
      UNTIL IsValid(S2)
      REPEAT
         OUTPUT "Score 3: "
         INPUT S3
      UNTIL IsValid(S3)
      StudentCount ← StudentCount + 1
      Averages[StudentCount] ← CalcAverage(S1, S2, S3)
      OUTPUT Name, ": average = ", Averages[StudentCount]
   ENDIF
UNTIL Name = "done" OR StudentCount = 50
IF StudentCount > 0 THEN
   CALL ClassSummary(Averages, StudentCount)
ENDIF`,
        mark_scheme: [
          '1 mark: IsValid function correct (returns BOOLEAN, checks 0-100)',
          '1 mark: each score validated with loop calling IsValid',
          '1 mark: averages stored in array correctly',
          '1 mark: main REPEAT loop stopping on "done" or count=50',
          '1 mark: ClassSummary procedure with correct parameters',
          '1 mark: Highest/Lowest initialised to first element, found correctly in loop'
        ]
      }
    ]
  }
}

]; // end TUTORIALS

export const TUTORIAL_MAP = Object.fromEntries(TUTORIALS.map(t => [t.id, t]));
