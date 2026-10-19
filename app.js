const subjects = {
  dsa: {
    title: "Data Structures & Algorithms",
    kicker: "DSA ROADMAP",
    color: "#7157d9",
    stages: [
      ["C++ prerequisites", "Program structure, input/output, variables and data types|Operators, expressions and type conversion|if/else, switch, loops and nested loops|Functions, parameters, return values and scope|Arrays, strings, references and pointers in C++|Pass by value versus pass by reference|Recursion fundamentals|STL basics: vector, string, pair, sort and iterators"],
      ["Arrays and complexity", "What data structures and algorithms are|Array declaration, initialization and indexing|Traversal and updating elements|Insertion and deletion in arrays|Finding minimum, maximum, sum and average|Reversing and rotating arrays|Frequency counting and duplicate detection|Time complexity and space complexity|Big O, Big Omega and Big Theta|Best, average and worst cases|Complexity of loops and nested loops|Amortized analysis basics"],
      ["Searching and elementary sorting", "Linear search|Binary search prerequisites and implementation|Binary search iterative and recursive|Selection sort|Bubble sort|Insertion sort|Stability and in-place sorting|Comparing sorting algorithms|Dry-running and analysing search/sort algorithms"],
      ["Strings and array problem patterns", "String traversal and modification|Character frequency and counting|Palindromes and anagrams|Duplicate and unique elements|Prefix sums and suffix sums|Difference arrays basics|Two-pointer technique|Sliding-window technique|Kadane's algorithm|Subarrays and subsequences|Matrix and 2D array traversal|Basic matrix operations and searching"],
      ["Recursion and backtracking", "Call stack and recursive execution|Base case and recursive case|Recursion tree and stack space|Recursive array and string problems|Factorial, Fibonacci and power|Subset and subsequence generation|Permutations and combinations|Backtracking principles|Maze and path problems|N-Queens and constraint-based search basics"],
      ["Linked lists", "Nodes, pointers and dynamic allocation|Singly linked list traversal|Insertion at beginning, end and position|Deletion by value or position|Searching and counting nodes|Reversing a linked list|Finding the middle node|Cycle detection using slow and fast pointers|Removing cycles|Merging sorted linked lists|Doubly linked lists|Circular linked lists|Common linked-list interview problems"],
      ["Stacks, queues and hashing", "Stack operations and implementation|Stack using arrays and linked lists|Balanced parentheses|Next greater and next smaller element|Infix, postfix and prefix basics|Queue operations and implementation|Circular queue|Deque and priority queue|Hashing, hash functions and collisions|unordered_map and unordered_set|Frequency counting and duplicate detection using hashing|Common stack, queue and hashing problems"],
      ["Advanced searching and sorting", "Merge sort|Quick sort and partitioning|Counting sort|Radix sort|Heap sort overview|Lower bound and upper bound|First and last occurrence|Search in rotated sorted arrays|Binary search on answer|Kth element and partition-based problems|Sorting with custom comparators"],
      ["Trees and heaps", "Tree terminology and representations|Binary trees and node structure|Preorder, inorder and postorder traversal|Level-order traversal and BFS|Tree height, depth and diameter|Balanced tree concepts|Binary search tree search, insertion and deletion|Lowest common ancestor|Tree views and path problems|Heap properties and implementation|Min-heap and max-heap|Priority queue in C++|Top-K elements and Kth largest/smallest|Trie basics"],
      ["Greedy algorithms", "Greedy strategy and correctness intuition|Activity selection and interval scheduling|Interval merging and overlap problems|Fractional knapsack|Job sequencing basics|Minimum number of platforms and related interval problems|Greedy versus dynamic programming"],
      ["Graph algorithms", "Graph terminology and representations|Adjacency matrix and adjacency list|Breadth-first search (BFS)|Depth-first search (DFS)|Connected components|Cycle detection in directed and undirected graphs|Bipartite graph checking|Topological sorting|Shortest path in unweighted graphs|Dijkstra's algorithm|Bellman-Ford algorithm|Floyd-Warshall algorithm|Minimum spanning tree|Prim's and Kruskal's algorithms|Disjoint-set union (DSU)|Strongly connected components basics"],
      ["Dynamic programming", "Overlapping subproblems and optimal substructure|Memoization versus tabulation|State, transition and base cases|Fibonacci and climbing stairs|House robber patterns|Grid and path DP|0/1 knapsack|Subset sum and partition problems|Coin change|Longest common subsequence|Longest increasing subsequence|Edit distance|String DP patterns|DP on trees and bitmask DP introductions"],
      ["Additional interview topics", "Bitwise operators and bit manipulation|Bit masks and common bit tricks|Monotonic stack and queue|Range query concepts|Fenwick tree and segment tree introductions|Trie-based problems|Advanced graph patterns|Advanced dynamic programming|Competitive-programming techniques when relevant"],
      ["Interview preparation and revision", "Re-solve previously failed problems|Mixed-topic timed practice|Explain approach before coding|Complexity analysis under interview conditions|Edge-case and test-case design|Mock coding interviews|Review weak patterns and maintain a mistake notebook"]
    ]
  },
  dbms: {
    title: "Database Management Systems", kicker: "DBMS ROADMAP", color: "#eb8a4d",
    stages: [
      ["Database foundations", "Data, information, database and DBMS|Advantages and limitations of DBMS|Database users and database administrator|DBMS architecture and three-schema architecture|Schema, instance and subschema|Data independence|Data dictionary and metadata|Database languages and interfaces"],
      ["Data models and ER modelling", "Hierarchical, network, relational and object-based models|Entities, attributes and relationships|Simple, composite, multivalued and derived attributes|Primary, candidate, super and foreign keys|Cardinality and participation constraints|Weak entities|ER diagrams|Enhanced ER model and specialization/generalization|ER-to-relational mapping"],
      ["Relational model and algebra", "Relations, tuples, attributes and domains|Relational integrity constraints|Entity and referential integrity|Relational algebra|Selection, projection and joins|Union, intersection, difference and Cartesian product|Relational calculus fundamentals"],
      ["SQL foundations and data modification", "SQL syntax and data types|CREATE, ALTER and DROP|INSERT, UPDATE and DELETE|SELECT, FROM and WHERE|Comparison, logical and pattern-matching operators|ORDER BY and DISTINCT|NULL values and three-valued logic|Primary key, foreign key, UNIQUE, CHECK and NOT NULL constraints|Views and basic indexes"],
      ["Intermediate and advanced SQL", "COUNT, SUM, AVG, MIN and MAX|GROUP BY and HAVING|INNER, LEFT, RIGHT and FULL JOIN concepts|Self joins and cross joins|Subqueries and correlated subqueries|EXISTS, IN, ANY and ALL|CASE expressions|UNION, UNION ALL, INTERSECT and EXCEPT where supported|Common table expressions (CTEs)|Recursive CTE basics|Window functions|ROW_NUMBER, RANK and DENSE_RANK|LEAD, LAG and running aggregates|Date, string and NULL-handling functions"],
      ["Database design and normalization", "Functional dependencies|Attribute closure and candidate keys|Armstrong's axioms basics|First normal form (1NF)|Second normal form (2NF)|Third normal form (3NF)|Boyce-Codd normal form (BCNF)|Multivalued dependencies and 4NF introduction|Lossless decomposition|Dependency preservation|Practical schema design and avoiding anomalies"],
      ["Transactions and concurrency", "Transaction concepts and states|ACID properties|Schedules and serializability|Conflict and view serializability basics|Concurrency problems and anomalies|Shared and exclusive locks|Two-phase locking|Deadlocks in databases|Timestamp ordering|Isolation levels|Dirty reads, non-repeatable reads and phantom reads|MVCC concepts"],
      ["Indexing and performance", "Why indexes exist|B-tree and B+ tree concepts|Clustered and nonclustered index concepts|Composite indexes|Selectivity and index trade-offs|Query execution plans|EXPLAIN and EXPLAIN ANALYZE|Query optimization basics|Avoiding unnecessary queries and N+1 patterns|Pagination strategies"],
      ["Recovery, security and advanced topics", "Database failures and recovery|Logging, checkpoints and recovery concepts|Backup and restore|Authorization and access control|GRANT and REVOKE|Role-based access control|Encryption and secure database configuration|Stored procedures and functions|Triggers and cursors|Embedded SQL|Distributed database concepts|Replication and partitioning basics|CAP theorem introduction|Database security and privacy"],
      ["Interview and practical revision", "Write SQL from problem statements|Solve join and aggregation exercises|Solve subquery and window-function problems|Design a relational schema from requirements|Explain indexes and transactions with examples|Debug incorrect queries|Practise SQL interview questions|Use PostgreSQL in a real application"]
    ]
  },
  dlca: {
    title: "Digital Logic & Computer Architecture", kicker: "DLCA ROADMAP", color: "#4b9bb5",
    stages: [
      ["Digital systems and Boolean foundations", "Digital computer fundamentals and functional units|Number systems: binary, decimal, octal and hexadecimal|Number-system conversions|Binary arithmetic|Signed number representation and complements|Fixed-point and floating-point representation basics|Boolean algebra laws and identities|Boolean expressions and truth tables|Logic gates: AND, OR, NOT, NAND, NOR, XOR and XNOR|Universal gates and gate implementation|Boolean-expression simplification|Karnaugh maps where required by the syllabus|TTL and basic logic-family characteristics"],
      ["Combinational circuits", "Combinational versus sequential circuits|Half adders and full adders|Binary adders and subtractors|Two's-complement arithmetic|Multiplexers and demultiplexers|Encoders and decoders|Comparators|Combinational circuit design and analysis|Truth tables and Boolean implementations"],
      ["Sequential circuits", "Latches and flip-flop fundamentals|SR flip-flop|JK flip-flop|Master-slave JK flip-flop|D flip-flop|T flip-flop|Characteristic and excitation tables|Registers and register transfer|Shift registers: SISO, SIPO, PISO and PIPO|Asynchronous/ripple counters|Synchronous counters|Controlled counters|Ring counters|State transitions and timing diagrams"],
      ["Memory and storage", "Memory-system characteristics|Memory organization and addressing|Two-dimensional and three-dimensional memory concepts|Memory hierarchy|RAM and ROM|DRAM and SRAM concepts|Flash memory|Cache memory and cache organization|Associative memory|Memory interleaving|Memory performance and trade-offs"],
      ["Input/output organization", "I/O interfaces|System buses and bus communication|Programmed I/O|Interrupt-driven I/O|Interrupt structure and priority|Direct Memory Access (DMA)|I/O processors|CPU–IOP communication|Comparing programmed, interrupt-driven and DMA-based I/O"],
      ["Processor architecture and parallelism", "Instruction execution fundamentals|RISC and CISC architectures|Parallel processors|Flynn's classification|Instruction pipelining|Arithmetic pipelines|Pipeline performance and hazards at a basic level|Multiprocessor concepts|Processor performance fundamentals"],
      ["Final revision and examination preparation", "Practise number-system conversions and binary arithmetic|Simplify Boolean expressions|Solve circuit-design questions|Draw flip-flop tables and timing diagrams|Solve counter and register problems|Revise memory hierarchy and cache concepts|Compare I/O techniques|Practise RISC/CISC and pipelining questions|Write structured answers to previous examination questions"]
    ]
  }
};

const practicals = {
  dsa: [
    ["C++ foundations", "Write programs using conditions, loops and functions|Find the largest of three numbers and check whether a number is prime|Calculate factorial using iteration and recursion|Work with vectors: insert, delete, traverse and update elements|Swap two values using references|Trace pointer and reference examples|Write small programs without copying a solution"],
    ["Arrays and complexity", "Read and print an array|Calculate sum and average|Find minimum and maximum|Reverse an array|Check whether an array is sorted|Find the second-largest element|Count even, odd and duplicate elements|Rotate an array left or right|Dry-run each loop and analyse its complexity|Implement array operations and explain their time complexity"],
    ["Searching and elementary sorting", "Implement linear search without using a library search function|Implement binary search iteratively and recursively|Implement selection, bubble and insertion sort|Count comparisons and swaps|Test empty, single-element, duplicate and reverse-sorted inputs|Compare sorting implementations on the same test arrays|Code each algorithm from memory and explain when it works"],
    ["Strings and array patterns", "Check a palindrome and anagram|Count character frequencies|Remove duplicate elements|Find a target pair in a sorted array|Find maximum subarray sum using Kadane's algorithm|Calculate range sums using prefix sums|Solve maximum-sum subarray problems with a sliding window|Transpose a matrix and calculate row/column sums|Solve basic array and string problems without hints"],
    ["Recursion and backtracking", "Implement factorial, Fibonacci and recursive power|Reverse a string recursively|Find the sum of array elements recursively|Generate subsets and permutations|Solve a simple maze/path problem|Trace the recursion tree for small inputs|Explain the base case and execution flow of each recursive solution"],
    ["Linked lists", "Create and traverse a linked list|Insert at the beginning, end and a given position|Delete a node by value|Reverse a linked list|Find the middle node|Detect a cycle using slow and fast pointers|Merge two sorted linked lists|Implement fundamental linked-list operations using pointers"],
    ["Stacks, queues and hashing", "Implement a stack using an array and a linked list|Implement a queue and circular queue|Check balanced parentheses|Solve next greater element|Count frequencies using unordered_map|Find duplicates and the first non-repeating character|Solve top-K frequency problems using a heap|Choose the appropriate data structure for a problem and justify your choice"],
    ["Advanced DSA", "Implement merge sort and quicksort|Find first and last occurrence of a target|Find lower and upper bounds|Search a rotated sorted array|Find the square root using binary search|Solve a binary-search-on-answer problem|Implement tree traversals, height, diameter and BST operations|Implement heap operations, priority queue and top-K problems|Implement graph adjacency lists, BFS, DFS, cycle detection and topological sorting|Implement Dijkstra, Prim and Kruskal|Implement memoization, tabulation, knapsack, coin change, LCS and LIS|Practise bit manipulation, monotonic stacks, tries, DSU, Fenwick trees and segment trees"],
    ["Interview practice", "Solve mixed-topic problems under a time limit|Explain your approach before coding|Test edge cases and analyse complexity|Re-solve previously failed problems|Conduct mock interviews and maintain a mistake notebook"]
  ],
  dbms: [
    ["Database foundations", "Install or access PostgreSQL|Create a database and inspect its tables|Draw a simple database architecture diagram|Create a small student database"],
    ["Relational model and ER modelling", "Draw an ER diagram for a college management system|Identify primary and foreign keys|Convert the ER diagram into relational tables|Insert sample data while respecting constraints"],
    ["SQL fundamentals", "Create a Students table|Insert at least 10 sample rows|Filter students by department and marks|Sort results and select specific columns|Practise AND, OR, IN, BETWEEN and LIKE"],
    ["Data modification and constraints", "Use CREATE, ALTER, INSERT, UPDATE and DELETE|Add constraints and test invalid data|Use transactions to recover from mistakes"],
    ["Joins and aggregation", "Create Students, Departments and Marks tables|Find average marks by department|Find departments with more than five students|List students with department names|Find departments with no students|Compare INNER JOIN and LEFT JOIN output"],
    ["Advanced SQL queries", "Find students scoring above the overall average|Find the highest-scoring student in each department|Rank students using ROW_NUMBER, RANK and DENSE_RANK|Use LEAD and LAG to compare consecutive records|Rewrite a complex query using a CTE"],
    ["Database design and normalization", "Start with an intentionally poorly designed table|Identify insertion, update and deletion anomalies|Normalize the design step by step|Draw the final ER diagram and create the resulting tables"],
    ["Transactions and concurrency", "Execute BEGIN, COMMIT and ROLLBACK|Transfer money between two accounts in a transaction|Test what happens when one operation fails|Explore isolation levels using two database sessions"],
    ["Indexing and optimization", "Create an index on a frequently queried column|Compare query plans using EXPLAIN ANALYZE|Compare indexed and non-indexed queries on sample data|Investigate why an index might not improve a query"],
    ["Recovery, security and advanced databases", "Create a database view|Create a restricted database user|Grant and revoke permissions|Perform a backup and restore|Write a trigger or stored procedure if supported"],
    ["Integrated DBMS project", "Build a college management database with students, courses, departments, enrolments and marks|Deliver an ER diagram and relational schema|Create constraints and normalized tables|Write at least 25 useful SQL queries|Include joins, subqueries, aggregations and window functions|Add transactions and indexes|Write backup and restore instructions|Document the design in a README|Use PostgreSQL consistently and verify dialect-specific syntax"]
  ],
  dlca: [
    ["Number systems and Boolean algebra", "Convert at least 20 numbers between number systems|Solve binary addition and subtraction exercises|Represent signed numbers using two's complement|Construct truth tables for AND, OR, NOT, NAND, NOR, XOR and XNOR|Simplify Boolean expressions by hand"],
    ["Combinational circuits", "Draw half-adder and full-adder circuits|Derive their truth tables|Build a binary subtractor|Implement Boolean functions using NAND or NOR gates|Solve multiplexer-based logic problems"],
    ["Flip-flops and sequential circuits", "Complete truth tables for all prescribed flip-flops|Draw timing diagrams|Trace state transitions for SISO, SIPO, PISO and PIPO shift registers|Construct counter-state tables|Compare ripple and synchronous counters|Simulate simple sequential circuits using a digital logic simulator"],
    ["Memory organization", "Calculate addressable memory capacity from address-line counts|Solve memory-size and organization problems|Work through cache hit/miss and hit-ratio exercises|Draw memory hierarchy diagrams|Compare SRAM and DRAM using practical characteristics"],
    ["Input/output organization", "Draw and label an I/O system block diagram|Compare programmed I/O, interrupts and DMA in worked scenarios|Solve basic transfer and timing questions|Trace the steps of an interrupt-handling sequence"],
    ["Processor architecture and pipelining", "Compare RISC and CISC using example instruction characteristics|Classify systems using Flynn's taxonomy|Draw a pipeline timing diagram|Calculate ideal pipeline throughput and speedup|Identify simple pipeline hazards"],
    ["Integrated DLCA practice", "Solve past-paper questions unit by unit|Redraw circuit diagrams and truth tables without notes|Practise binary arithmetic and memory calculations|Complete timed theory and numerical tests|Keep a notebook of formulas, tables, diagrams and common mistakes"]
  ]
};

const state = JSON.parse(localStorage.getItem("studypath-progress") || "{}");
let currentSubject = "dsa";
let currentMode = "theory";
let query = "";
let stageFilter = "all";
let practiceSubject = "dsa";
const el = id => document.getElementById(id);
const stagesFor = (subject, mode = currentMode) => mode === "practical" ? practicals[subject] : subjects[subject].stages;
const topicsFor = (subject, mode = currentMode) => stagesFor(subject, mode).flatMap((stage, stageIndex) => stage[1].split("|").map((name, topicIndex) => ({ key: `${mode}-${subject}-${stageIndex}-${topicIndex}`, name, stageIndex })));
const allTopics = (subject, mode = currentMode) => topicsFor(subject, mode);
const isDone = key => Boolean(state[key]);
const completed = (subject, mode = currentMode) => allTopics(subject, mode).filter(topic => isDone(topic.key)).length;

function renderTabs() {
  Object.keys(subjects).forEach(subject => {
    const theoryTotal = allTopics(subject, "theory").length;
    const practicalTotal = allTopics(subject, "practical").length;
    const total = theoryTotal + practicalTotal;
    el(`${subject}-tab-summary`).textContent = `${subjects[subject].stages.length} theory · ${practicals[subject].length} practical stages`;
    el(`${subject}-tab-progress`).textContent = `${Math.round((completed(subject, "theory") + completed(subject, "practical")) / total * 100)}%`;
  });
}
function renderStageFilter() {
  el("stage-filter").innerHTML = `<option value="all">All stages</option>${stagesFor(currentSubject).map((stage, i) => `<option value="${i}">Stage ${i + 1}: ${stage[0]}</option>`).join("")}`;
  el("stage-filter").value = stageFilter;
}
function render() {
  const subject = subjects[currentSubject], stages = stagesFor(currentSubject), topics = allTopics(currentSubject), done = completed(currentSubject);
  el("subject-title").textContent = currentMode === "practical" ? `${subject.title} Practicals` : subject.title; el("subject-kicker").textContent = currentMode === "practical" ? "PRACTICAL ROADMAP" : subject.kicker;
  el("subject-count").textContent = `${done} of ${topics.length} topics`;
  const percent = Math.round(done / topics.length * 100);
  el("subject-percent").textContent = `${percent}%`; el("subject-progress-bar").style.width = `${percent}%`; el("subject-progress-bar").style.background = subject.color;
  renderStageFilter();
  const visibleStages = stages.map((stage, i) => ({stage, i})).filter(({stage, i}) => stageFilter === "all" || Number(stageFilter) === i).map(({stage, i}) => {
    const visible = stage[1].split("|").map((name, j) => ({name, j, key: `${currentMode}-${currentSubject}-${i}-${j}`})).filter(t => !query || t.name.toLowerCase().includes(query.toLowerCase()));
    if (!visible.length) return "";
    const stageDone = stage[1].split("|").filter((_, j) => isDone(`${currentMode}-${currentSubject}-${i}-${j}`)).length;
    return `<article class="stage-card"><div class="stage-header" role="button" tabindex="0" aria-expanded="true"><span class="stage-number">STAGE ${String(i + 1).padStart(2, "0")}</span><strong class="stage-title">${stage[0]}</strong><span class="stage-meta">${stageDone}/${stage[1].split("|").length} done</span><span class="chevron">⌄</span></div><div class="topic-list">${visible.map(t => `<label class="topic ${isDone(t.key) ? "done" : ""}"><input type="checkbox" data-key="${t.key}" ${isDone(t.key) ? "checked" : ""}><span>${t.name}</span></label>`).join("")}</div></article>`;
  }).join("");
  el("stage-list").innerHTML = visibleStages; el("empty-state").hidden = Boolean(visibleStages);
  document.querySelectorAll(".stage-header").forEach(header => header.addEventListener("click", () => header.parentElement.classList.toggle("collapsed")));
  document.querySelectorAll("[data-key]").forEach(input => input.addEventListener("change", event => { state[event.target.dataset.key] = event.target.checked; localStorage.setItem("studypath-progress", JSON.stringify(state)); render(); }));
  renderTabs(); renderOverall();
}
function renderOverall() {
  const total = Object.keys(subjects).reduce((sum, subject) => sum + allTopics(subject, "theory").length + allTopics(subject, "practical").length, 0);
  const done = Object.keys(subjects).reduce((sum, subject) => sum + completed(subject, "theory") + completed(subject, "practical"), 0);
  const percent = Math.round(done / total * 100);
  el("overall-percent").textContent = `${percent}%`; el("overall-count").textContent = `${done} of ${total} topics`;
  el("overall-ring").style.background = `conic-gradient(var(--purple) ${percent * 3.6}deg, #ececf4 0deg)`;
}
document.querySelectorAll(".subject-tab").forEach(tab => tab.addEventListener("click", () => { currentSubject = tab.dataset.subject; document.querySelectorAll(".subject-tab").forEach(t => t.classList.toggle("active", t === tab)); query = ""; el("search").value = ""; stageFilter = "all"; render(); }));
document.querySelectorAll(".mode-button").forEach(button => button.addEventListener("click", () => { currentMode = button.dataset.mode; document.querySelectorAll(".mode-button").forEach(b => b.classList.toggle("active", b === button)); query = ""; el("search").value = ""; stageFilter = "all"; render(); }));
el("search").addEventListener("input", event => { query = event.target.value; render(); });
el("stage-filter").addEventListener("change", event => { stageFilter = event.target.value; render(); });
el("reset-progress").addEventListener("click", () => { if (confirm(`Reset all ${subjects[currentSubject].title} ${currentMode} progress?`)) { ["theory", "practical"].forEach(mode => { const previousMode = currentMode; currentMode = mode; allTopics(currentSubject).forEach(t => delete state[t.key]); currentMode = previousMode; }); localStorage.setItem("studypath-progress", JSON.stringify(state)); render(); } });
document.querySelectorAll(".nav-button").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".nav-button").forEach(item => item.classList.toggle("active", item === button));
  el("roadmap-view").hidden = button.dataset.view !== "roadmap";
  el("practice-view").hidden = button.dataset.view !== "practice";
}));
document.querySelectorAll(".practice-subject").forEach(button => button.addEventListener("click", () => {
  practiceSubject = button.dataset.practiceSubject;
  document.querySelectorAll(".practice-subject").forEach(item => item.classList.toggle("active", item === button));
  const language = el("practice-language");
  language.value = practiceSubject === "dbms" ? "sql" : "cpp";
  el("practice-editor").value = practiceSubject === "dbms"
    ? "SELECT s.name, s.marks\nFROM students AS s\nORDER BY s.marks DESC;"
    : "#include <iostream>\n\nint main() {\n  std::cout << \"Start practising!\";\n  return 0;\n}";
  el("practice-output").textContent = "Ready when you are. Your result will appear here.";
}));
el("practice-language").addEventListener("change", event => {
  if (event.target.value === "sql") document.querySelector('[data-practice-subject="dbms"]').click();
  else document.querySelector('[data-practice-subject="dsa"]').click();
});
el("practice-editor").addEventListener("input", event => localStorage.setItem(`studypath-practice-${practiceSubject}`, event.target.value));
el("practice-input").addEventListener("input", event => localStorage.setItem(`studypath-input-${practiceSubject}`, event.target.value));
el("run-practice").addEventListener("click", () => {
  el("practice-output").textContent = "Sandbox runner is not connected yet. Your code was saved locally; execution will be enabled after the language and database runtime are configured.";
});
render();
