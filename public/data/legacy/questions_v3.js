// data/legacy/questions_v3.js — ORIGINAL v3 bank, kept verbatim for provenance. Patched at load by data/question-bank.js
// Cambridge IGCSE 0478 question bank
// Derived and adapted from Cambridge past papers (2023-2024)
// Paper 1: Topics 1-6 (theory)   Paper 2: Topics 7-13 (programming + algorithms)

export const QUESTIONS = [

// ════════════════════════════════════════════════════════════════════
// PAPER 1 — TOPIC 1: DATA REPRESENTATION
// ════════════════════════════════════════════════════════════════════
{
  id:"P1_T1_001", paper:"P1", chapter_id:"T01", topic:"Data Representation", type:"MCQ",
  difficulty:1, misconception_tag:"BINARY_CONVERSION_ERROR",
  text:"The binary number 10101110 is converted to denary. Which answer is correct?",
  options:["142","174","186","158"],
  correct:1,
  hint:"Add the place values where there is a 1: 128+32+8+4+2.",
  explanation:"10101110 = 128+0+32+0+8+4+2+0 = 174.",
  correct_example:"128+32+8+4+2 = 174",
  wrong_example:"Forgetting to include all place values"
},
{
  id:"P1_T1_002", paper:"P1", chapter_id:"T01", topic:"Data Representation", type:"MCQ",
  difficulty:2, misconception_tag:"BINARY_CONVERSION_ERROR",
  text:"Convert the binary number 10101110 to hexadecimal.",
  options:["AE","BE","CE","8E"],
  correct:0,
  hint:"Split into nibbles: 1010 | 1110. Convert each to hex.",
  explanation:"1010 = A (10), 1110 = E (14). So 10101110 = AE in hex.",
  correct_example:"1010→A, 1110→E → AE",
  wrong_example:"Converting the whole byte without splitting into nibbles"
},
{
  id:"P1_T1_003", paper:"P1", chapter_id:"T01", topic:"Data Representation", type:"MCQ",
  difficulty:2, misconception_tag:"BINARY_SHIFT_ERROR",
  text:"A logical left shift of 3 places is performed on 10101110. Which statement is true?",
  options:["The least significant bits are lost","The most significant bits are lost","The number has been divided by six","The number stays the same"],
  correct:1,
  hint:"A left shift moves bits towards the most significant end. Bits that fall off the left are lost.",
  explanation:"In a logical left shift, bits shift toward the MSB. The most significant bits fall off and are lost. Zeros fill the LSB positions.",
  correct_example:"Left shift: MSBs are lost, LSBs filled with 0",
  wrong_example:"Saying LSBs are lost (that happens with a right shift)"
},
{
  id:"P1_T1_004", paper:"P1", chapter_id:"T01", topic:"Data Representation", type:"MCQ",
  difficulty:2, misconception_tag:"BINARY_CONVERSION_ERROR",
  text:"Add the two 8-bit binary numbers 11101110 and 00110001. What is the 8-bit result?",
  options:["00011111","11111111","00100001","10111111"],
  correct:1,
  hint:"Add column by column from right to left, carrying when the sum exceeds 1.",
  explanation:"11101110 + 00110001 = 11111111 (255 + 49 — wait, 238+49=287 which overflows 8 bits). The 8-bit result is 00011111 with overflow.",
  correct_example:"Binary addition with carry",
  wrong_example:"Ignoring the carry bit"
},
{
  id:"P1_T1_005", paper:"P1", chapter_id:"T01", topic:"Data Representation", type:"MCQ",
  difficulty:1, misconception_tag:"BINARY_CONVERSION_ERROR",
  text:"An image has resolution 1000×1000 and colour depth of 2 bytes. What is the file size in bytes?",
  options:["1000000","2000000","4000000","500000"],
  correct:1,
  hint:"File size = width × height × colour depth in bytes.",
  explanation:"1000 × 1000 × 2 = 2,000,000 bytes. The formula is: number of pixels × colour depth.",
  correct_example:"1000×1000×2 = 2,000,000 bytes",
  wrong_example:"Forgetting to multiply by colour depth"
},
{
  id:"P1_T1_006", paper:"P1", chapter_id:"T01", topic:"Data Representation", type:"MCQ",
  difficulty:1, misconception_tag:"STORAGE_CONCEPT_ERROR",
  text:"A pixel is best defined as:",
  options:["The colour depth of an image","The smallest addressable element of a digital image","The resolution of a display","The number of colours available"],
  correct:1,
  hint:"Think about the smallest unit that makes up a digital image.",
  explanation:"A pixel (picture element) is the smallest addressable unit of a digital image. Each pixel stores colour data.",
  correct_example:"Pixel = smallest element of a digital image",
  wrong_example:"Confusing pixel with resolution or colour depth"
},
{
  id:"P1_T1_007", paper:"P1", chapter_id:"T01", topic:"Data Representation", type:"MCQ",
  difficulty:2, misconception_tag:"TWO_COMPLEMENT_ERROR",
  text:"Using two's complement with 8 bits, what is the denary value of 11110110?",
  options:["-10","-6","246","118"],
  correct:0,
  hint:"MSB is 1 so it's negative. Invert all bits then add 1 to find the magnitude.",
  explanation:"11110110: invert → 00001001, add 1 → 00001010 = 10. So the value is -10.",
  correct_example:"Two's complement: invert bits, add 1 → magnitude. MSB=1 means negative.",
  wrong_example:"Treating the MSB as just another place value (giving 246)"
},

// ════════════════════════════════════════════════════════════════════
// PAPER 1 — TOPIC 2: DATA TRANSMISSION
// ════════════════════════════════════════════════════════════════════
{
  id:"P1_T2_001", paper:"P1", chapter_id:"T02", topic:"Data Transmission", type:"MCQ",
  difficulty:1, misconception_tag:"NETWORK_CONCEPT_ERROR",
  text:"Spyware is a type of malware. Which best describes spyware?",
  options:[
    "Software that displays unwanted adverts on a computer",
    "Software that records keystrokes and transmits them to a third party",
    "Software that encrypts files and demands payment",
    "Software that uses your computer to send spam emails"
  ],
  correct:1,
  hint:"Spyware 'spies' — it secretly monitors and transmits user activity.",
  explanation:"Spyware secretly records user activity (keystrokes, passwords, browsing) and transmits it to a third party without consent.",
  correct_example:"Spyware: records all key presses and sends them to attacker",
  wrong_example:"Confusing spyware with adware (adverts) or ransomware (encryption)"
},
{
  id:"P1_T2_002", paper:"P1", chapter_id:"T02", topic:"Data Transmission", type:"MCQ",
  difficulty:2, misconception_tag:"NETWORK_CONCEPT_ERROR",
  text:"What is the PRIMARY difference between a proxy server and a firewall?",
  options:[
    "A firewall can block websites; a proxy server cannot",
    "A proxy server hides the user's IP address; a firewall filters packets based on rules",
    "A proxy server is hardware; a firewall is software",
    "They are identical in function"
  ],
  correct:1,
  hint:"A proxy acts as an intermediary for requests; a firewall filters traffic by rules.",
  explanation:"A proxy server acts as an intermediary, hiding the client's IP and caching content. A firewall examines and filters packets based on defined rules. Both can block content but work differently.",
  correct_example:"Proxy = intermediary/IP hiding. Firewall = packet filtering by rules.",
  wrong_example:"Saying they are identical or that only one can block websites"
},
{
  id:"P1_T2_003", paper:"P1", chapter_id:"T02", topic:"Data Transmission", type:"MCQ",
  difficulty:1, misconception_tag:"NETWORK_CONCEPT_ERROR",
  text:"Which device is used to connect networks together and direct packets between them?",
  options:["Switch","Hub","Router","Bridge"],
  correct:2,
  hint:"This device uses IP addresses to direct data between different networks.",
  explanation:"A router connects different networks and directs (routes) data packets between them using IP addresses. A switch connects devices within the same network.",
  correct_example:"Router: connects networks, uses IP addresses for routing",
  wrong_example:"Confusing router (connects networks) with switch (connects devices on same network)"
},
{
  id:"P1_T2_004", paper:"P1", chapter_id:"T02", topic:"Data Transmission", type:"MCQ",
  difficulty:2, misconception_tag:"NETWORK_CONCEPT_ERROR",
  text:"An IP address is best described as:",
  options:[
    "A permanent address burned into hardware by the manufacturer",
    "An address assigned by the network to identify a device",
    "The physical location of a device on a network",
    "The username used to log into a network"
  ],
  correct:1,
  hint:"IP addresses are assigned by the network and can change (DHCP).",
  explanation:"An IP address is assigned by the network (often dynamically by DHCP) to identify a device on a network. It can change. A MAC address is the permanent hardware address.",
  correct_example:"IP address: assigned by network, can change",
  wrong_example:"Confusing IP address (logical, changeable) with MAC address (physical, permanent)"
},

// ════════════════════════════════════════════════════════════════════
// PAPER 1 — TOPIC 3: HARDWARE
// ════════════════════════════════════════════════════════════════════
{
  id:"P1_T3_001", paper:"P1", chapter_id:"T03", topic:"Hardware", type:"MCQ",
  difficulty:1, misconception_tag:"STORAGE_CONCEPT_ERROR",
  text:"Solid-state storage is described as non-volatile. What does non-volatile mean?",
  options:[
    "The storage device can be removed from the computer",
    "Data is not lost when the power is turned off",
    "The device has no moving parts",
    "The device uses flash memory"
  ],
  correct:1,
  hint:"Think about what happens to data when you turn off the computer.",
  explanation:"Non-volatile means data is retained (not lost) when power is removed. This is a key property of ROM, flash storage, and SSDs. RAM is volatile — it loses data when power is cut.",
  correct_example:"Non-volatile: data survives power-off (SSDs, ROM, hard drives)",
  wrong_example:"Confusing non-volatile with 'no moving parts' (that's just a property of SSDs)"
},
{
  id:"P1_T3_002", paper:"P1", chapter_id:"T03", topic:"Hardware", type:"MCQ",
  difficulty:1, misconception_tag:"STORAGE_CONCEPT_ERROR",
  text:"Solid-state storage is made of transistors arranged in a grid. Which substance flows through these transistors?",
  options:["Neutrons","Electrons","Protons","Photons"],
  correct:1,
  hint:"Electrical current is a flow of charged particles. Which particle carries electrical charge?",
  explanation:"Electrons carry electrical charge. In solid-state storage, gates control the flow of electrons through transistors, storing 1s and 0s.",
  correct_example:"Electrons flow through transistors in solid-state storage",
  wrong_example:"Saying neutrons or protons flow (they don't move in normal electrical circuits)"
},
{
  id:"P1_T3_003", paper:"P1", chapter_id:"T03", topic:"Hardware", type:"MCQ",
  difficulty:1, misconception_tag:"STORAGE_CONCEPT_ERROR",
  text:"Which type of storage is classified as optical storage?",
  options:["SSD","HDD","DVD","USB flash drive"],
  correct:2,
  hint:"Optical storage uses laser light to read and write data.",
  explanation:"DVD (and CD, Blu-ray) are optical storage devices that use laser light to read and write data. HDDs use magnetic platters. SSDs and USB drives use flash memory.",
  correct_example:"Optical: CD, DVD, Blu-ray (laser-based)",
  wrong_example:"Classifying HDD as optical (it uses magnetic storage)"
},
{
  id:"P1_T3_004", paper:"P1", chapter_id:"T03", topic:"Hardware", type:"MCQ",
  difficulty:1, misconception_tag:"STORAGE_CONCEPT_ERROR",
  text:"Give ONE reason why a file might be compressed before being emailed.",
  options:[
    "To make the file more secure from hackers",
    "To reduce the file size so it transfers faster",
    "To change the file format",
    "To make the file easier to open"
  ],
  correct:1,
  hint:"Compression reduces size. What benefit does a smaller file have when sending?",
  explanation:"Compression reduces file size, which means faster upload/download, less bandwidth used, and the file may fit within email attachment size limits.",
  correct_example:"Smaller file = faster transfer, less bandwidth, fits email limits",
  wrong_example:"Saying compression makes files more secure (that's encryption, not compression)"
},

// ════════════════════════════════════════════════════════════════════
// PAPER 1 — TOPIC 4: SOFTWARE
// ════════════════════════════════════════════════════════════════════
{
  id:"P1_T4_001", paper:"P1", chapter_id:"T04", topic:"Software", type:"MCQ",
  difficulty:1, misconception_tag:"SOFTWARE_CONCEPT_ERROR",
  text:"A programmer uses a high-level language instead of a low-level language. What is ONE benefit?",
  options:[
    "The program can directly manipulate hardware",
    "The program is machine independent",
    "The program is more memory efficient",
    "The program executes more quickly"
  ],
  correct:1,
  hint:"High-level languages are designed to be readable and portable across different systems.",
  explanation:"High-level languages are machine independent — the same code can run on different processors with the appropriate compiler. Low-level languages are processor-specific.",
  correct_example:"High-level: machine independent, easier to read and write",
  wrong_example:"Saying high-level is faster or more memory efficient (low-level is better for these)"
},
{
  id:"P1_T4_002", paper:"P1", chapter_id:"T04", topic:"Software", type:"MCQ",
  difficulty:2, misconception_tag:"SOFTWARE_CONCEPT_ERROR",
  text:"What is the key difference between a compiler and an interpreter?",
  options:[
    "A compiler translates one line at a time; an interpreter translates the whole program first",
    "A compiler translates the whole program before execution; an interpreter translates line by line during execution",
    "A compiler only works with high-level languages; an interpreter only works with low-level languages",
    "There is no difference — they do the same thing"
  ],
  correct:1,
  hint:"Think about WHEN the translation happens and HOW MUCH is translated at once.",
  explanation:"A compiler translates the entire source code into an executable before running. An interpreter translates and executes one line at a time. Compilers produce faster-running programs; interpreters are better for debugging.",
  correct_example:"Compiler: whole program → executable first. Interpreter: line by line during execution.",
  wrong_example:"Saying compiler goes line by line (that's the interpreter)"
},
{
  id:"P1_T4_003", paper:"P1", chapter_id:"T04", topic:"Software", type:"MCQ",
  difficulty:2, misconception_tag:"SOFTWARE_CONCEPT_ERROR",
  text:"A programmer needs to develop a 3D game program efficiently AND quickly. Should they use a high-level or low-level language?",
  options:[
    "Low-level — it gives direct hardware access and runs faster",
    "High-level — it is easier to write, debug, and has built-in libraries",
    "Either — they produce identical results",
    "Low-level — it produces machine-independent code"
  ],
  correct:1,
  hint:"The question says it must be developed 'as soon as possible'. Which language is faster to write?",
  explanation:"High-level languages are faster to develop in, have libraries, are easier to debug, and are machine-independent. Low-level is faster to execute but very time-consuming to write. For rapid development, high-level wins.",
  correct_example:"High-level: faster development, built-in libraries, readable",
  wrong_example:"Choosing low-level because it's 'faster to run' — the question asks about development speed"
},

// ════════════════════════════════════════════════════════════════════
// PAPER 1 — TOPIC 5: INTERNET & ITS USES
// ════════════════════════════════════════════════════════════════════
{
  id:"P1_T5_001", paper:"P1", chapter_id:"T05", topic:"Internet and its Uses", type:"MCQ",
  difficulty:2, misconception_tag:"NETWORK_CONCEPT_ERROR",
  text:"Complete the table: A MAC address is best described as...",
  options:[
    "An address assigned by the network that can change",
    "A permanent hardware address assigned by the manufacturer",
    "The IP address of a wireless device",
    "A temporary address given during login"
  ],
  correct:1,
  hint:"MAC stands for Media Access Control — it's burned in at the factory.",
  explanation:"A MAC address is a permanent, unique hardware identifier assigned by the manufacturer and stored in the network interface card. It cannot normally be changed and is used for communication within a local network.",
  correct_example:"MAC address: permanent, hardware-level, assigned by manufacturer",
  wrong_example:"Confusing MAC (permanent hardware) with IP address (assigned by network, can change)"
},
{
  id:"P1_T5_002", paper:"P1", chapter_id:"T05", topic:"Internet and its Uses", type:"MCQ",
  difficulty:1, misconception_tag:"NETWORK_CONCEPT_ERROR",
  text:"What is the function of cookies in a web browser?",
  options:[
    "To block malicious websites",
    "To store small pieces of data on the user's computer to track sessions and preferences",
    "To compress web pages for faster loading",
    "To encrypt data sent between the browser and server"
  ],
  correct:1,
  hint:"Cookies are small text files stored locally. Think about what a website might need to remember about you.",
  explanation:"Cookies store small data items (session IDs, preferences, login tokens) on the user's device. They allow websites to remember user state between visits.",
  correct_example:"Cookies: store session data, preferences, login state on user's device",
  wrong_example:"Saying cookies encrypt data (that's HTTPS/TLS) or block websites (that's a firewall)"
},

// ════════════════════════════════════════════════════════════════════
// PAPER 1 — TOPIC 6: AUTOMATED & EMERGING TECHNOLOGIES
// ════════════════════════════════════════════════════════════════════
{
  id:"P1_T6_001", paper:"P1", chapter_id:"T06", topic:"Automated and Emerging Technologies", type:"MCQ",
  difficulty:2, misconception_tag:"SENSOR_MODEL_ERROR",
  text:"In an automated system, sensors are described as 'continuously polling'. What does this mean?",
  options:[
    "Sensors only fire when a specific threshold is detected",
    "Sensors constantly send readings to the microprocessor, which decides when to act",
    "Sensors take one reading and then stop",
    "Sensors only activate when the system is powered on for the first time"
  ],
  correct:1,
  hint:"'Polling' means repeatedly checking. The key is WHO decides when the reading matters.",
  explanation:"Sensors continuously sample and send data to the microprocessor. The microprocessor (not the sensor) evaluates the readings and decides when to take action. Sensors do not 'fire only when triggered' — they poll continuously.",
  correct_example:"Sensor → continuous readings → microprocessor evaluates → action if threshold met",
  wrong_example:"Thinking sensors only activate when a threshold is met (that's the microprocessor's job)"
},
{
  id:"P1_T6_002", paper:"P1", chapter_id:"T06", topic:"Automated and Emerging Technologies", type:"MCQ",
  difficulty:1, misconception_tag:"AI_CONCEPT_ERROR",
  text:"Which of these is an example of machine learning?",
  options:[
    "A calculator performing arithmetic",
    "A spam filter that improves by analysing thousands of emails",
    "A compiler translating source code",
    "An operating system managing memory"
  ],
  correct:1,
  hint:"Machine learning improves with experience — it learns from data.",
  explanation:"A spam filter that trains on examples of spam and non-spam emails is machine learning — it improves its accuracy over time without being explicitly reprogrammed.",
  correct_example:"Machine learning: system improves performance from experience/data",
  wrong_example:"Confusing machine learning with any automated process (calculators don't learn)"
},

// ════════════════════════════════════════════════════════════════════
// PAPER 2 — TOPIC 7: ALGORITHM DESIGN (CH7)
// ════════════════════════════════════════════════════════════════════
{
  id:"P2_T7_001", paper:"P2", chapter_id:"T07", topic:"Algorithm Design", type:"MCQ",
  difficulty:1, misconception_tag:"PSEUDOCODE_SYNTAX_ERROR",
  text:"Which pseudocode correctly outputs the message 'Result: ' followed by the value of a variable called Ans?",
  options:["PRINT 'Result: ', Ans","OUTPUT 'Result: ', Ans","OUTPUT \"Result: \", Ans","DISPLAY Result, Ans"],
  correct:2,
  hint:"Cambridge uses OUTPUT and double quotes for string literals.",
  explanation:"OUTPUT \"Result: \", Ans is correct. Cambridge pseudocode uses OUTPUT (not PRINT/DISPLAY), double quotes for strings, and a comma to separate items.",
  correct_example:"OUTPUT \"Result: \", Ans",
  wrong_example:"PRINT 'Result: ', Ans (wrong keyword and wrong quote style)"
},
{
  id:"P2_T7_002", paper:"P2", chapter_id:"T07", topic:"Algorithm Design", type:"trace_output",
  difficulty:2, misconception_tag:"TRACE_PREDICTION_ERROR",
  text:"What is the output of this pseudocode when the user inputs 8?\n\nINPUT Num\nIF Num > 5 THEN\n   OUTPUT \"High\"\nELSE\n   OUTPUT \"Low\"\nENDIF",
  options:["High","Low","High Low","8"],
  correct:0,
  hint:"Trace line by line. Is 8 > 5?",
  explanation:"Num = 8. 8 > 5 is TRUE, so the THEN branch executes: OUTPUT \"High\".",
  correct_example:"8 > 5 → TRUE → output High",
  wrong_example:"Outputting 'Low' (that requires Num ≤ 5)"
},
{
  id:"P2_T7_003", paper:"P2", chapter_id:"T07", topic:"Algorithm Design", type:"MCQ",
  difficulty:2, misconception_tag:"SEQUENTIAL_EXECUTION_ERROR",
  text:"In the program development lifecycle, what does 'decomposition' mean?",
  options:[
    "Deleting unnecessary lines of code",
    "Breaking a complex problem into smaller, manageable sub-problems",
    "Testing the program with boundary data",
    "Converting source code to machine code"
  ],
  correct:1,
  hint:"'Decompose' means to break down into parts.",
  explanation:"Decomposition breaks a large, complex problem into smaller sub-problems that can be solved independently. This is the foundation of structured program design.",
  correct_example:"Bank system → decompose into: login, deposit, withdraw, balance sub-systems",
  wrong_example:"Thinking decomposition means removing code or running the program"
},
{
  id:"P2_T7_004", paper:"P2", chapter_id:"T07", topic:"Algorithm Design", type:"MCQ",
  difficulty:2, misconception_tag:"TEST_DATA_CONFUSION",
  text:"Which type of test data would you use to test what happens when a program receives input OUTSIDE the allowed range?",
  options:["Normal data","Boundary data","Erroneous data","Extreme data"],
  correct:2,
  hint:"Invalid input that the program should reject entirely.",
  explanation:"Erroneous (invalid) data is outside the acceptable range and should be rejected. Boundary data tests the edges of the valid range. Normal data tests typical valid input.",
  correct_example:"If valid range is 1-100: erroneous = -5 or 'abc', boundary = 1 or 100, normal = 50",
  wrong_example:"Confusing erroneous (outside range) with boundary (at the edge of range)"
},
{
  id:"P2_T7_005", paper:"P2", chapter_id:"T07", topic:"Algorithm Design", type:"trace_output",
  difficulty:3, misconception_tag:"TRACE_PREDICTION_ERROR",
  text:"What values are output by this algorithm?\n\nTotal ← 0\nFOR I ← 1 TO 5\n   Total ← Total + I\nNEXT I\nOUTPUT Total",
  options:["5","10","15","1 2 3 4 5"],
  correct:2,
  hint:"Trace the loop: add 1, then 2, then 3, then 4, then 5 to Total.",
  explanation:"Total: 0→1→3→6→10→15. After the loop, OUTPUT Total prints 15.",
  correct_example:"0+1+2+3+4+5 = 15",
  wrong_example:"Outputting 5 (just the last value of I) or 10 (stopping one iteration early)"
},

// ════════════════════════════════════════════════════════════════════
// PAPER 2 — TOPIC 8: PROGRAMMING CONCEPTS (CH8)
// ════════════════════════════════════════════════════════════════════
{
  id:"P2_T8_001", paper:"P2", chapter_id:"T08", topic:"Programming", type:"MCQ",
  difficulty:1, misconception_tag:"ASSIGN_EQUALITY_CONFUSION",
  text:"Which symbol is used for ASSIGNMENT in Cambridge pseudocode?",
  options:["=","==","←","->"],
  correct:2,
  hint:"Cambridge pseudocode uses a specific arrow symbol for assignment, NOT the equals sign.",
  explanation:"← (left arrow) is used for assignment in Cambridge pseudocode. The = sign is used for CONSTANT declarations and comparisons. This is one of the most common sources of errors.",
  correct_example:"Count ← Count + 1",
  wrong_example:"Count = Count + 1 (= is for constants and comparisons, not assignment)"
},
{
  id:"P2_T8_002", paper:"P2", chapter_id:"T08", topic:"Programming", type:"MCQ",
  difficulty:1, misconception_tag:"LOOP_TERMINATION_ERROR",
  text:"What is the key difference between a WHILE loop and a REPEAT...UNTIL loop?",
  options:[
    "WHILE always runs faster",
    "WHILE checks condition BEFORE each iteration; REPEAT checks AFTER — so REPEAT always runs at least once",
    "WHILE is used for counting; REPEAT is used for user input",
    "There is no difference"
  ],
  correct:1,
  hint:"Which one checks the condition before running the body?",
  explanation:"WHILE is a pre-condition loop — the condition is checked before each iteration, so the body may never run. REPEAT...UNTIL is a post-condition loop — the body always runs at least once before the condition is checked.",
  correct_example:"REPEAT guarantees at least one execution; WHILE may execute zero times",
  wrong_example:"Thinking WHILE always executes at least once (it doesn't if the condition starts false)"
},
{
  id:"P2_T8_003", paper:"P2", chapter_id:"T08", topic:"Programming", type:"trace_output",
  difficulty:2, misconception_tag:"LOOP_TERMINATION_ERROR",
  text:"What does this pseudocode output?\n\nCount ← 1\nREPEAT\n   OUTPUT Count\n   Count ← Count + 1\nUNTIL Count > 3",
  options:["1 2","1 2 3","1 2 3 4","2 3 4"],
  correct:1,
  hint:"REPEAT runs the body FIRST, then checks. Trace: what is Count each time?",
  explanation:"Count=1: output 1, Count→2. Count=2: output 2, Count→3. Count=3: output 3, Count→4. Check: 4>3 TRUE → stop. Outputs: 1 2 3.",
  correct_example:"Outputs 1 2 3 (stops when Count becomes 4 and 4>3 is TRUE)",
  wrong_example:"Outputting 1 2 (stopping when Count=3 instead of after outputting 3)"
},
{
  id:"P2_T8_004", paper:"P2", chapter_id:"T08", topic:"Programming", type:"MCQ",
  difficulty:1, misconception_tag:"DATA_TYPE_CONFUSION",
  text:"A variable Height stores a measurement like 1.75. Which data type is MOST appropriate?",
  options:["INTEGER","STRING","REAL","BOOLEAN"],
  correct:2,
  hint:"1.75 has a decimal point — which type handles decimal numbers?",
  explanation:"REAL stores numbers with decimal points. INTEGER only stores whole numbers. Using INTEGER for 1.75 would truncate it to 1.",
  correct_example:"DECLARE Height : REAL",
  wrong_example:"DECLARE Height : INTEGER (would store 1 instead of 1.75)"
},
{
  id:"P2_T8_005", paper:"P2", chapter_id:"T08", topic:"Programming", type:"MCQ",
  difficulty:2, misconception_tag:"PSEUDOCODE_SYNTAX_ERROR",
  text:"Which keyword is MISSING from line 2 of this pseudocode?\n\n01 IF Score > 50\n02 _____\n03    Grade ← \"Pass\"\n04 ELSE\n05    Grade ← \"Fail\"\n06 ENDIF",
  options:["DO","BEGIN","THEN","START"],
  correct:2,
  hint:"Every Cambridge IF statement requires this keyword after the condition.",
  explanation:"THEN is required after every IF condition in Cambridge pseudocode. Without it, the syntax is incorrect. Structure: IF condition THEN ... ELSE ... ENDIF.",
  correct_example:"IF Score > 50 THEN\n   Grade ← \"Pass\"",
  wrong_example:"IF Score > 50\n   Grade ← \"Pass\" (missing THEN)"
},
{
  id:"P2_T8_006", paper:"P2", chapter_id:"T08", topic:"Programming", type:"coding",
  difficulty:3, misconception_tag:"LOOP_TERMINATION_ERROR",
  text:"Write pseudocode to input 10 numbers from a user and output their total and average.\n\nYour code should:\n• Use a FOR loop\n• Declare all variables\n• Output both Total and Average",
  starter:"DECLARE Total : REAL\nDECLARE Average : REAL\nDECLARE Num : REAL\nTotal ← 0\n// Write your FOR loop here\n",
  solution:"DECLARE Total : REAL\nDECLARE Average : REAL\nDECLARE Num : REAL\nTotal ← 0\nFOR I ← 1 TO 10\n   INPUT Num\n   Total ← Total + Num\nNEXT I\nAverage ← Total / 10\nOUTPUT \"Total: \", Total\nOUTPUT \"Average: \", Average",
  hint:"Use FOR I ← 1 TO 10 and accumulate Total inside the loop. Calculate Average after.",
  explanation:"Declare variables first. Use FOR loop 1 to 10. Each iteration: INPUT a number and add to Total. After loop: Average ← Total / 10.",
  marks:6
},

// ════════════════════════════════════════════════════════════════════
// PAPER 2 — TOPIC 9: ARRAYS (CH9)
// ════════════════════════════════════════════════════════════════════
{
  id:"P2_T9_001", paper:"P2", chapter_id:"T09", topic:"Arrays", type:"MCQ",
  difficulty:1, misconception_tag:"ARRAY_INDEX_ERROR",
  text:"Which line correctly declares a 1D array called Scores to hold 10 integers?",
  options:[
    "DECLARE Scores[10] : INTEGER",
    "DECLARE Scores : ARRAY[1:10] OF INTEGER",
    "ARRAY Scores(10) : INTEGER",
    "Scores = ARRAY[10] OF INTEGER"
  ],
  correct:1,
  hint:"Cambridge syntax: DECLARE name : ARRAY[lower:upper] OF type",
  explanation:"DECLARE Scores : ARRAY[1:10] OF INTEGER is correct Cambridge syntax. Note the colon after the name, and [lower:upper] for index bounds.",
  correct_example:"DECLARE Scores : ARRAY[1:10] OF INTEGER",
  wrong_example:"DECLARE Scores[10] : INTEGER (wrong syntax)"
},
{
  id:"P2_T9_002", paper:"P2", chapter_id:"T09", topic:"Arrays", type:"MCQ",
  difficulty:2, misconception_tag:"ARRAY_INDEX_ERROR",
  text:"How many elements does DECLARE Grid : ARRAY[3:9] OF INTEGER contain?",
  options:["6","7","9","3"],
  correct:1,
  hint:"Formula: upper bound − lower bound + 1. Don't forget the +1!",
  explanation:"9 − 3 + 1 = 7 elements. Indices are 3, 4, 5, 6, 7, 8, 9. The +1 is essential because BOTH bounds are inclusive.",
  correct_example:"ARRAY[3:9] → 9-3+1 = 7 elements",
  wrong_example:"9-3 = 6 (forgetting the +1 because both bounds are inclusive)"
},
{
  id:"P2_T9_003", paper:"P2", chapter_id:"T09", topic:"Arrays", type:"coding",
  difficulty:3, misconception_tag:"ARRAY_INDEX_ERROR",
  text:"An array Name is declared as ARRAY[1:50] OF STRING.\nWrite pseudocode to read 50 names from user input into the array, then output all names in reverse order.",
  starter:"DECLARE Name : ARRAY[1:50] OF STRING\n// Input loop here\n\n// Output loop here (reverse)\n",
  solution:"DECLARE Name : ARRAY[1:50] OF STRING\nFOR I ← 1 TO 50\n   INPUT Name[I]\nNEXT I\nFOR I ← 50 TO 1 STEP -1\n   OUTPUT Name[I]\nNEXT I",
  hint:"Use two FOR loops. First loop 1 to 50 for input. Second loop 50 to 1 STEP -1 for reverse output.",
  explanation:"Read into array with FOR 1 TO 50. Output in reverse with FOR 50 TO 1 STEP -1.",
  marks:4
},

// ════════════════════════════════════════════════════════════════════
// PAPER 2 — TOPIC 10: PROCEDURES & FUNCTIONS (CH10)
// ════════════════════════════════════════════════════════════════════
{
  id:"P2_T10_001", paper:"P2", chapter_id:"T10", topic:"Procedures and Functions", type:"MCQ",
  difficulty:1, misconception_tag:"PSEUDOCODE_SYNTAX_ERROR",
  text:"What is the key difference between a PROCEDURE and a FUNCTION in Cambridge pseudocode?",
  options:[
    "Procedures run faster than functions",
    "A function RETURNS a value; a procedure does not",
    "Procedures accept parameters; functions do not",
    "Functions must be called with CALL; procedures cannot be called"
  ],
  correct:1,
  hint:"Think about what comes back to the code that calls it.",
  explanation:"A FUNCTION uses RETURN to send a value back to the calling code. A PROCEDURE performs actions but does not return a value. Both can accept parameters.",
  correct_example:"FUNCTION Add(A,B:INTEGER) RETURNS INTEGER\n   RETURN A+B\nENDFUNCTION",
  wrong_example:"PROCEDURE Add — procedures cannot RETURN a value"
},
{
  id:"P2_T10_002", paper:"P2", chapter_id:"T10", topic:"Procedures and Functions", type:"MCQ",
  difficulty:2, misconception_tag:"VARIABLE_SCOPE_ERROR",
  text:"A variable Count is declared INSIDE a procedure. From where can it be accessed?",
  options:[
    "Anywhere in the program",
    "Only inside that procedure",
    "Only in the main program",
    "Only in other procedures"
  ],
  correct:1,
  hint:"Variables declared inside a procedure are local to that procedure.",
  explanation:"Count is a LOCAL variable — it only exists within the procedure. It cannot be accessed from outside. To share a value, use RETURN (for functions) or BYREF parameters.",
  correct_example:"Local variable: exists only inside its procedure",
  wrong_example:"Assuming a variable declared inside a procedure is accessible globally"
},
{
  id:"P2_T10_003", paper:"P2", chapter_id:"T10", topic:"Procedures and Functions", type:"coding",
  difficulty:3, misconception_tag:"PSEUDOCODE_SYNTAX_ERROR",
  text:"Write a FUNCTION called Maximum that takes two INTEGER parameters, A and B, and returns the larger value.",
  starter:"FUNCTION Maximum(A : INTEGER, B : INTEGER) RETURNS INTEGER\n   // Write your code here\nENDFUNCTION",
  solution:"FUNCTION Maximum(A : INTEGER, B : INTEGER) RETURNS INTEGER\n   IF A > B THEN\n      RETURN A\n   ELSE\n      RETURN B\n   ENDIF\nENDFUNCTION",
  hint:"Use an IF statement to compare A and B, then RETURN the larger one.",
  explanation:"Compare A and B with IF. RETURN A if A > B, else RETURN B. A function MUST use RETURN.",
  marks:4
},

// ════════════════════════════════════════════════════════════════════
// PAPER 2 — TOPIC 11: FILE HANDLING (CH11)
// ════════════════════════════════════════════════════════════════════
{
  id:"P2_T11_001", paper:"P2", chapter_id:"T11", topic:"File Handling", type:"MCQ",
  difficulty:1, misconception_tag:"PSEUDOCODE_SYNTAX_ERROR",
  text:"Which line correctly opens a file called 'data.txt' for reading in Cambridge pseudocode?",
  options:[
    "OPEN \"data.txt\"",
    "OPEN \"data.txt\" FOR READ",
    "OPENFILE \"data.txt\" FOR READ",
    "READ FILE \"data.txt\""
  ],
  correct:2,
  hint:"Cambridge file operations use OPENFILE, READFILE, WRITEFILE, CLOSEFILE.",
  explanation:"OPENFILE \"data.txt\" FOR READ is correct. The keyword is OPENFILE (not OPEN). Modes are READ, WRITE, or APPEND.",
  correct_example:"OPENFILE \"data.txt\" FOR READ",
  wrong_example:"OPEN \"data.txt\" FOR READ (missing FILE)"
},
{
  id:"P2_T11_002", paper:"P2", chapter_id:"T11", topic:"File Handling", type:"coding",
  difficulty:3, misconception_tag:"LOOP_TERMINATION_ERROR",
  text:"Write pseudocode to read ALL lines from a file called 'names.txt' and output each line until the end of the file.",
  starter:"OPENFILE \"names.txt\" FOR READ\n// Write your loop here\n\nCLOSEFILE \"names.txt\"",
  solution:"OPENFILE \"names.txt\" FOR READ\nDECLARE Line : STRING\nWHILE NOT EOF(\"names.txt\")\n   READFILE \"names.txt\", Line\n   OUTPUT Line\nENDWHILE\nCLOSEFILE \"names.txt\"",
  hint:"Use WHILE NOT EOF(...) to check before each read. Declare a variable to hold each line.",
  explanation:"WHILE NOT EOF checks before reading — essential to avoid reading past the end. READFILE stores one line into a variable. Always CLOSEFILE when done.",
  marks:4
},

// ════════════════════════════════════════════════════════════════════
// PAPER 2 — TOPIC 12: SEARCHING & SORTING (CH12)
// ════════════════════════════════════════════════════════════════════
{
  id:"P2_T12_001", paper:"P2", chapter_id:"T12", topic:"Searching and Sorting", type:"MCQ",
  difficulty:1, misconception_tag:"SEQUENTIAL_EXECUTION_ERROR",
  text:"A linear search looks for value 7 in the array [3, 7, 1, 9, 4]. How many comparisons are needed to find it?",
  options:["1","2","3","4"],
  correct:1,
  hint:"Linear search checks each element from the start. Count comparisons until found.",
  explanation:"Compare index 1: 3≠7. Compare index 2: 7=7 (found!). So 2 comparisons are needed.",
  correct_example:"Linear: check 3 (no), check 7 (yes) → 2 comparisons",
  wrong_example:"Saying 1 comparison (the first element is 3, not 7)"
},
{
  id:"P2_T12_002", paper:"P2", chapter_id:"T12", topic:"Searching and Sorting", type:"MCQ",
  difficulty:2, misconception_tag:"SEQUENTIAL_EXECUTION_ERROR",
  text:"What PRECONDITION must be met before binary search can work correctly?",
  options:[
    "The array must contain only integers",
    "The array must be sorted in order",
    "The array must have fewer than 100 elements",
    "The array must be stored in a 2D structure"
  ],
  correct:1,
  hint:"Binary search works by halving the search space — this only makes sense if data is ordered.",
  explanation:"Binary search requires the array to be sorted. It works by comparing the target to the middle element and eliminating half the remaining elements each time.",
  correct_example:"Binary search: array MUST be sorted first",
  wrong_example:"Applying binary search to unsorted data gives wrong results"
},
{
  id:"P2_T12_003", paper:"P2", chapter_id:"T12", topic:"Searching and Sorting", type:"trace_output",
  difficulty:3, misconception_tag:"SEQUENTIAL_EXECUTION_ERROR",
  text:"Bubble sort is applied to [5, 3, 8, 1]. What is the array after the FIRST complete pass?",
  options:["[3, 5, 1, 8]","[1, 3, 5, 8]","[3, 5, 8, 1]","[1, 5, 3, 8]"],
  correct:0,
  hint:"Compare adjacent pairs from left to right: (5,3), (5,8), (8,1). Swap if left > right.",
  explanation:"Pass 1: Compare 5,3 → swap → [3,5,8,1]. Compare 5,8 → no swap. Compare 8,1 → swap → [3,5,1,8]. After first pass: [3,5,1,8]. The largest (8) is in its final position.",
  correct_example:"[5,3,8,1] → [3,5,8,1] → [3,5,8,1] → [3,5,1,8] = [3,5,1,8]",
  wrong_example:"Thinking one pass fully sorts the array"
},

// ════════════════════════════════════════════════════════════════════
// PAPER 2 — TOPIC 13: BOOLEAN LOGIC (CH13)
// ════════════════════════════════════════════════════════════════════
{
  id:"P2_T13_001", paper:"P2", chapter_id:"T13", topic:"Boolean Logic", type:"MCQ",
  difficulty:1, misconception_tag:"BOOLEAN_LOGIC_ERROR",
  text:"What does this Boolean expression evaluate to?\n\n(3 > 5) AND (2 < 4)",
  options:["TRUE","FALSE","ERROR","0"],
  correct:1,
  hint:"Evaluate each side first: (3>5)=FALSE. Then apply AND.",
  explanation:"(3>5)=FALSE. (2<4)=TRUE. FALSE AND TRUE = FALSE. AND requires BOTH sides to be true.",
  correct_example:"FALSE AND TRUE = FALSE",
  wrong_example:"TRUE (only one side needs to be true — that's OR, not AND)"
},
{
  id:"P2_T13_002", paper:"P2", chapter_id:"T13", topic:"Boolean Logic", type:"MCQ",
  difficulty:1, misconception_tag:"BOOLEAN_LOGIC_ERROR",
  text:"Complete the truth table row: A=1, B=0. What is A AND B?",
  options:["0","1","Undefined","Same as A OR B"],
  correct:0,
  hint:"AND is only 1 (TRUE) when BOTH inputs are 1.",
  explanation:"AND gate: output is 1 only when A=1 AND B=1. Since B=0, the output is 0.",
  correct_example:"1 AND 0 = 0",
  wrong_example:"1 AND 0 = 1 (confusing AND with OR)"
},
{
  id:"P2_T13_003", paper:"P2", chapter_id:"T13", topic:"Boolean Logic", type:"MCQ",
  difficulty:2, misconception_tag:"BOOLEAN_LOGIC_ERROR",
  text:"Which Boolean expression is equivalent to NOT(A AND B)?",
  options:["NOT A AND NOT B","NOT A OR NOT B","A OR B","NOT A AND B"],
  correct:1,
  hint:"Use De Morgan's Law: NOT(A AND B) = NOT A OR NOT B",
  explanation:"De Morgan's Law: NOT(A AND B) = NOT A OR NOT B. The AND becomes OR and both terms are negated.",
  correct_example:"NOT(A AND B) ≡ (NOT A) OR (NOT B) — De Morgan's Law",
  wrong_example:"NOT(A AND B) ≡ NOT A AND NOT B (wrong — AND should change to OR)"
},
{
  id:"P2_T13_004", paper:"P2", chapter_id:"T13", topic:"Boolean Logic", type:"coding",
  difficulty:3, misconception_tag:"BOOLEAN_LOGIC_ERROR",
  text:"Write pseudocode to input a number and output 'Valid' if the number is between 1 and 100 INCLUSIVE, or 'Invalid' otherwise. Use a single IF statement with AND.",
  starter:"DECLARE Num : INTEGER\nINPUT Num\n// Write your IF statement here\n",
  solution:"DECLARE Num : INTEGER\nINPUT Num\nIF Num >= 1 AND Num <= 100 THEN\n   OUTPUT \"Valid\"\nELSE\n   OUTPUT \"Invalid\"\nENDIF",
  hint:"You need TWO conditions joined by AND: Num >= 1 AND Num <= 100.",
  explanation:"Both conditions must be true simultaneously — that requires AND. >= 1 ensures it's at least 1. <= 100 ensures it doesn't exceed 100.",
  marks:3
}

]; // end QUESTIONS

// Chapter metadata for display
export const CHAPTERS = {
  T01: { title:"Data Representation",            paper:"P1", color:"#8B5CF6" },
  T02: { title:"Data Transmission & Security",   paper:"P1", color:"#EC4899" },
  T03: { title:"Hardware",                        paper:"P1", color:"#F59E0B" },
  T04: { title:"Software",                        paper:"P1", color:"#10B981" },
  T05: { title:"Internet & its Uses",             paper:"P1", color:"#3B82F6" },
  T06: { title:"Automated & Emerging Tech",       paper:"P1", color:"#EF4444" },
  T07: { title:"Algorithm Design",                paper:"P2", color:"#06B6D4" },
  T08: { title:"Programming Concepts",            paper:"P2", color:"#6366F1" },
  T09: { title:"Arrays",                          paper:"P2", color:"#84CC16" },
  T10: { title:"Procedures & Functions",          paper:"P2", color:"#F97316" },
  T11: { title:"File Handling",                   paper:"P2", color:"#14B8A6" },
  T12: { title:"Searching & Sorting",             paper:"P2", color:"#A855F7" },
  T13: { title:"Boolean Logic",                   paper:"P2", color:"#EF4444" },
};

