/* =========================================================
   SCI BOWL READER
   ========================================================= */

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";


/* =========================================================
   STATE
   ========================================================= */

let packets = [];

let allQuestions = [];
let questions = [];

let current = 0;

/*
  Button states:

  "question" = ready to read
  "reading"  = currently reading
  "answer"   = ready to reveal
  "next"     = ready for next question
*/

let state = "question";


/*
  Every time speech starts, this number changes.

  This lets us cancel delayed speech reliably.
*/

let speechRun = 0;


/* =========================================================
   ELEMENTS
   ========================================================= */

const packetSelect =
  document.getElementById("packet");

const subjectSelect =
  document.getElementById("subject");

const speedSelect =
  document.getElementById("speed");

const voiceSelect =
  document.getElementById("voice");

const info =
  document.getElementById("info");

const questionDiv =
  document.getElementById("question");

const answerDiv =
  document.getElementById("answer");

const mainButton =
  document.getElementById("mainButton");

const interruptButton =
  document.getElementById("interrupt");


/* =========================================================
   SPEECH SETTINGS
   ========================================================= */

/*
  These control the pauses between sections.

  Increase these if you want a slower,
  more realistic Science Bowl reader.
*/

const PAUSES = {

  betweenSections: 350,

  beforeChoices: 700,

  betweenChoices: 1000

};


/* =========================================================
   VOICES
   ========================================================= */

function loadVoices() {

  const voices =
    speechSynthesis.getVoices();

  voiceSelect.innerHTML = "";

  const englishVoices =
    voices.filter(voice =>
      voice.lang &&
      voice.lang
        .toLowerCase()
        .startsWith("en")
    );


  englishVoices.forEach(
    (voice, index) => {

      const option =
        document.createElement("option");

      option.value = index;

      option.textContent =
        voice.name;

      voiceSelect.appendChild(
        option
      );

    }
  );

}


speechSynthesis.onvoiceschanged =
  loadVoices;

loadVoices();


/* =========================================================
   GET SELECTED VOICE
   ========================================================= */

function getSelectedVoice() {

  const voices =
    speechSynthesis.getVoices();

  const englishVoices =
    voices.filter(voice =>
      voice.lang &&
      voice.lang
        .toLowerCase()
        .startsWith("en")
    );


  return englishVoices[
    voiceSelect.selectedIndex
  ];

}


/* =========================================================
   READ PDF
   ========================================================= */

async function readPDF(url) {

  info.textContent =
    "Loading PDF...";


  const pdf =
    await pdfjsLib
      .getDocument(url)
      .promise;


  let fullText = "";


  for (
    let pageNumber = 1;
    pageNumber <= pdf.numPages;
    pageNumber++
  ) {

    info.textContent =
      `Reading packet... page ${pageNumber}/${pdf.numPages}`;


    const page =
      await pdf.getPage(pageNumber);


    const content =
      await page.getTextContent();


    /*
      PDF.js sometimes returns text
      in strange visual order.

      Reconstruct the lines using
      their coordinates.
    */

    const items =
      content.items
        .filter(item =>
          item.str &&
          item.str.trim()
        )
        .map(item => ({

          text: item.str.trim(),

          x: item.transform[4],

          y: item.transform[5]

        }));


    const lines = [];


    for (const item of items) {

      let line =
        lines.find(existing =>
          Math.abs(
            existing.y - item.y
          ) < 3
        );


      if (!line) {

        line = {

          y: item.y,

          items: []

        };

        lines.push(line);

      }


      line.items.push(item);

    }


    lines.sort(
      (a, b) =>
        b.y - a.y
    );


    const pageLines =
      lines.map(line => {

        line.items.sort(
          (a, b) =>
            a.x - b.x
        );


        return line.items
          .map(item => item.text)
          .join(" ");

      });


    fullText +=
      "\n" +
      pageLines.join("\n");

  }


  return fullText;

}


/* =========================================================
   CLEAN TEXT
   ========================================================= */

function cleanText(text) {

  return text

    .replace(/\r/g, "")

    .replace(
      /High School Round \d+ Page \d+/gi,
      ""
    )

    .replace(
      /\s+/g,
      " "
    )

    .trim();

}


/* =========================================================
   PARSE ANSWER
   ========================================================= */

function extractAnswer(text) {

  const match =
    text.match(
      /ANSWER\s*:\s*(.*)$/i
    );


  if (!match) {

    return "";

  }


  let answer =
    match[1].trim();


  /*
    Remove solution/explanation text.
  */

  answer =
    answer.replace(
      /\s*\(?Solution:.*$/i,
      ""
    );


  /*
    Remove ACCEPT information
    from what gets displayed/read.
  */

  answer =
    answer.replace(
      /\s*\(ACCEPT:.*?\)/gi,
      ""
    );


  return answer.trim();

}


/* =========================================================
   PARSE ONE QUESTION
   ========================================================= */

function parseQuestionBlock(
  block,
  type
) {

  /*
    Example:

    1) BIOLOGY Short Answer
    question...
    ANSWER: PHENOTYPE
  */


  const header =
    block.match(
      /(\d+)\)\s*(EARTH SCIENCE|GENERAL SCIENCE|BIOLOGY|CHEMISTRY|PHYSICS|ASTRONOMY|MATH)\s+(Short Answer|Multiple Choice)\b/i
    );


  if (!header) {

    return null;

  }


  const number =
    Number(header[1]);


  const subject =
    header[2]
      .trim()
      .toUpperCase();


  const format =
    header[3];


  let body =
    block.substring(
      header.index +
      header[0].length
    );


  body =
    cleanText(body);


  /*
    Find ANSWER:
  */

  const answerIndex =
    body.search(
      /\bANSWER\s*:/i
    );


  let questionText = "";

  let answer = "";


  if (answerIndex >= 0) {

    questionText =
      body
        .substring(
          0,
          answerIndex
        )
        .trim();


    answer =
      extractAnswer(
        body.substring(
          answerIndex
        )
      );

  } else {

    questionText =
      body;

  }


  /*
    Remove solution text.
  */

  questionText =
    questionText.replace(
      /\s*\(?Solution:.*$/i,
      ""
    );


  /*
    Multiple-choice options.
  */

  const choices = {

    W: "",
    X: "",
    Y: "",
    Z: ""

  };


  if (
    format
      .toLowerCase()
      .includes("multiple")
  ) {

    const choiceRegex =
      /(?:^|\s)([WXYZ])\)\s*(.*?)(?=\s+[WXYZ]\)\s|$)/gi;


    let match;


    while (
      (match =
        choiceRegex.exec(
          questionText
        ))
    ) {

      choices[
        match[1].toUpperCase()
      ] =
        match[2].trim();

    }


    /*
      Remove choices from the stem.
    */

    questionText =
      questionText
        .replace(
          /\s+[WXYZ]\)\s+.*?(?=\s+[WXYZ]\)\s|$)/gi,
          ""
        )
        .trim();

  }


  return {

    number,

    type,

    subject,

    format,

    text: questionText,

    choices,

    answer

  };

}


/* =========================================================
   PARSE ENTIRE PACKET
   ========================================================= */

function parseQuestions(text) {

  text =
    text
      .replace(
        /High School Round \d+ Page \d+/gi,
        ""
      );


  /*
    Find TOSS-UP and BONUS markers.

    This keeps the packet's original order.
  */

  const markerRegex =
    /\b(TOSS-UP|BONUS)\b/gi;


  const markers = [];


  let match;


  while (
    (match =
      markerRegex.exec(text))
  ) {

    markers.push({

      type:
        match[1].toUpperCase(),

      index:
        match.index

    });

  }


  const results = [];


  for (
    let i = 0;
    i < markers.length;
    i++
  ) {

    const marker =
      markers[i];


    const start =
      marker.index;


    const end =
      i + 1 < markers.length
        ? markers[i + 1].index
        : text.length;


    let block =
      text.substring(
        start,
        end
      );


    block =
      block.replace(
        /^(TOSS-UP|BONUS)\s*/i,
        ""
      );


    const question =
      parseQuestionBlock(
        block,
        marker.type
      );


    if (question) {

      results.push(question);

    }

  }


  return results;

}


/* =========================================================
   LOAD PACKETS.JSON
   ========================================================= */

async function loadPackets() {

  try {

    info.textContent =
      "Loading packets...";


    const response =
      await fetch(
        "/packets.json"
      );


    if (!response.ok) {

      throw new Error(
        `packets.json returned ${response.status}`
      );

    }


    packets =
      await response.json();


    packetSelect.innerHTML =
      "";


    packets.forEach(
      (packet, index) => {

        const option =
          document.createElement(
            "option"
          );


        option.value =
          index;


        option.textContent =
          packet.name;


        packetSelect.appendChild(
          option
        );

      }
    );


    await loadPacket(0);


  } catch (error) {

    console.error(error);

    info.textContent =
      "Could not load packets.";

    questionDiv.textContent =
      error.message;

  }

}


/* =========================================================
   LOAD PACKET
   ========================================================= */

async function loadPacket(index) {

  try {

    stopSpeech();


    current = 0;

    state = "question";

    answerDiv.textContent =
      "";


    const text =
      await readPDF(
        packets[index].file
      );


    console.log(
      "EXTRACTED PDF TEXT:",
      text
    );


    allQuestions =
      parseQuestions(text);


    console.log(
      "PARSED QUESTIONS:",
      allQuestions
    );


    if (
      allQuestions.length === 0
    ) {

      throw new Error(
        "No Science Bowl questions were detected."
      );

    }


    buildSubjectList();

    applySubjectFilter();


  } catch (error) {

    console.error(error);

    info.textContent =
      "Could not load packet.";

    questionDiv.textContent =
      error.message;

  }

}


/* =========================================================
   SUBJECT LIST
   ========================================================= */

function buildSubjectList() {

  const subjects =
    [
      ...new Set(
        allQuestions.map(
          q => q.subject
        )
      )
    ];


  subjectSelect.innerHTML =
    "";


  const allOption =
    document.createElement(
      "option"
    );


  allOption.value =
    "all";


  allOption.textContent =
    "All Subjects";


  subjectSelect.appendChild(
    allOption
  );


  subjects.forEach(
    subject => {

      const option =
        document.createElement(
          "option"
        );


      option.value =
        subject;


      option.textContent =
        formatSubject(subject);


      subjectSelect.appendChild(
        option
      );

    }
  );

}


/* =========================================================
   SUBJECT FILTER
   ========================================================= */

function applySubjectFilter() {

  const selected =
    subjectSelect.value;


  if (
    selected === "all"
  ) {

    questions =
      [...allQuestions];

  } else {

    questions =
      allQuestions.filter(
        q =>
          q.subject ===
          selected
      );

  }


  current = 0;

  state = "question";

  showQuestion();

}


/* =========================================================
   FORMAT SUBJECT
   ========================================================= */

function formatSubject(subject) {

  return subject
    .toLowerCase()
    .replace(
      /\b\w/g,
      letter =>
        letter.toUpperCase()
    );

}


/* =========================================================
   DISPLAY QUESTION
   ========================================================= */

function showQuestion() {

  stopSpeech();

  answerDiv.textContent =
    "";


  if (
    questions.length === 0
  ) {

    questionDiv.textContent =
      "No questions found.";

    info.textContent =
      "No questions match this subject.";

    return;

  }


  const q =
    questions[current];


  const typeName =
    q.type === "TOSS-UP"
      ? "TOSS-UP"
      : "BONUS";


  questionDiv.innerHTML = `

    <div class="question-label">

      ${formatSubject(q.subject)}
      ·
      ${typeName}
      ${q.number}

    </div>

    <div class="question-format">

      ${escapeHTML(q.format)}

    </div>

    <div class="question-text">

      ${escapeHTML(q.text)}

    </div>

    ${
      hasChoices(q)
        ? renderChoices(q)
        : ""
    }

  `;


  info.textContent =
    `${current + 1} of ${questions.length}`;


  state =
    "question";


  mainButton.textContent =
    "🔊 READ QUESTION";

}


/* =========================================================
   CHOICES
   ========================================================= */

function hasChoices(q) {

  return (
    q.choices.W ||
    q.choices.X ||
    q.choices.Y ||
    q.choices.Z
  );

}


function renderChoices(q) {

  return `

    <div class="choices">

      ${renderChoice(
        "W",
        q.choices.W
      )}

      ${renderChoice(
        "X",
        q.choices.X
      )}

      ${renderChoice(
        "Y",
        q.choices.Y
      )}

      ${renderChoice(
        "Z",
        q.choices.Z
      )}

    </div>

  `;

}


function renderChoice(
  letter,
  text
) {

  if (!text) return "";

  return `

    <div class="choice">

      <span class="choice-letter">
        ${letter}
      </span>

      ${escapeHTML(text)}

    </div>

  `;

}


/* =========================================================
   ESCAPE HTML
   ========================================================= */

function escapeHTML(text) {

  return String(text)

    .replace(
      /&/g,
      "&amp;"
    )

    .replace(
      /</g,
      "&lt;"
    )

    .replace(
      />/g,
      "&gt;"
    )

    .replace(
      /"/g,
      "&quot;"
    )

    .replace(
      /'/g,
      "&#039;"
    );

}


/* =========================================================
   STOP SPEECH
   ========================================================= */

function stopSpeech() {

  /*
    Invalidate any currently running
    speech sequence.
  */

  speechRun++;


  /*
    Cancel the actual browser speech.
  */

  speechSynthesis.cancel();

}


/* =========================================================
   SPEAK ONE SECTION
   ========================================================= */

function createUtterance(text) {

  const utterance =
    new SpeechSynthesisUtterance(
      text
    );


  utterance.rate =
    Number(
      speedSelect.value
    );


  const voice =
    getSelectedVoice();


  if (voice) {

    utterance.voice =
      voice;

  }


  return utterance;

}


/* =========================================================
   READ SCIENCE BOWL QUESTION
   ========================================================= */

function speakScienceBowlQuestion(q) {

  /*
    Stop anything currently speaking.
  */

  stopSpeech();


  /*
    Create a new speech run.

    If INTERRUPT is clicked,
    this number changes and all
    future chunks become invalid.
  */

  const thisRun =
    speechRun;


  state =
    "reading";


  mainButton.textContent =
    "🔊 READING...";


  /*
    Build the question pieces.
  */

  const parts = [];


  parts.push(
    formatSubject(q.subject)
  );


  parts.push(
    q.type === "TOSS-UP"
      ? "toss-up"
      : "bonus"
  );


  parts.push(
    `${q.number}`
  );


  parts.push(
    q.format
  );


  parts.push(
    q.text
  );


  /*
    Add choices separately.
  */

  if (q.choices.W) {

    parts.push(
      `W. ${q.choices.W}`
    );

  }


  if (q.choices.X) {

    parts.push(
      `X. ${q.choices.X}`
    );

  }


  if (q.choices.Y) {

    parts.push(
      `Y. ${q.choices.Y}`
    );

  }


  if (q.choices.Z) {

    parts.push(
      `Z. ${q.choices.Z}`
    );

  }


  let index = 0;


  function speakNext() {

    /*
      INTERRUPT was clicked.
    */

    if (
      thisRun !== speechRun
    ) {

      return;

    }


    /*
      Everything has finished.
    */

    if (
      index >= parts.length
    ) {

      state =
        "answer";


      mainButton.textContent =
        "💗 REVEAL ANSWER";


      return;

    }


    const currentPart =
      parts[index];


    const utterance =
      createUtterance(
        currentPart
      );


    utterance.onend = () => {

      /*
        Don't continue if
        INTERRUPT was clicked.
      */

      if (
        thisRun !== speechRun
      ) {

        return;

      }


      const previous =
        parts[index];


      const next =
        parts[index + 1];


      const previousIsChoice =
        /^[WXYZ]\./i.test(
          previous
        );


      const nextIsChoice =
        next &&
        /^[WXYZ]\./i.test(
          next
        );


      let pause =
        PAUSES.betweenSections;


      /*
        Longer pause before W.
      */

      if (
        nextIsChoice &&
        !previousIsChoice
      ) {

        pause =
          PAUSES.beforeChoices;

      }


      /*
        Longer pause between
        W, X, Y, Z.
      */

      if (
        previousIsChoice &&
        nextIsChoice
      ) {

        pause =
          PAUSES.betweenChoices;

      }


      index++;


      setTimeout(
        speakNext,
        pause
      );

    };


    utterance.onerror = () => {

      if (
        thisRun !== speechRun
      ) {

        return;

      }


      state =
        "answer";


      mainButton.textContent =
        "💗 REVEAL ANSWER";

    };


    speechSynthesis.speak(
      utterance
    );

  }


  speakNext();

}


/* =========================================================
   REVEAL ANSWER
   ========================================================= */

function revealAnswer() {

  const q =
    questions[current];


  if (!q) return;


  stopSpeech();


  if (!q.answer) {

    answerDiv.textContent =
      "Answer not detected.";

  } else {

    answerDiv.textContent =
      `Answer: ${q.answer}`;

    /*
      Read the answer aloud.
    */

    const utterance =
      createUtterance(
        `The answer is ${q.answer}`
      );


    speechSynthesis.speak(
      utterance
    );

  }


  state =
    "next";


  mainButton.textContent =
    "✨ NEXT QUESTION";

}


/* =========================================================
   MAIN BUTTON
   ========================================================= */

mainButton.addEventListener(
  "click",
  () => {

    if (
      !questions.length
    ) {

      return;

    }


    /*
      READ QUESTION
    */

    if (
      state === "question"
    ) {

      speakScienceBowlQuestion(
        questions[current]
      );

      return;

    }


    /*
      If currently reading,
      clicking the main button
      does nothing.

      Use INTERRUPT instead.
    */

    if (
      state === "reading"
    ) {

      return;

    }


    /*
      REVEAL ANSWER
    */

    if (
      state === "answer"
    ) {

      revealAnswer();

      return;

    }


    /*
      NEXT QUESTION
    */

    if (
      state === "next"
    ) {

      if (
        current <
        questions.length - 1
      ) {

        current++;

        showQuestion();

      } else {

        info.textContent =
          "You finished the packet! 🎀";

        mainButton.textContent =
          "🎀 PACKET COMPLETE";

      }

    }

  }
);


/* =========================================================
   INTERRUPT BUTTON
   ========================================================= */

interruptButton.addEventListener(
  "click",
  () => {

    /*
      Kill the current speech
      AND invalidate any pending
      delayed speech chunks.
    */

    stopSpeech();


    /*
      IMPORTANT:

      Interrupt does NOT reveal
      the answer.

      If we were reading, go directly
      to the reveal-answer state.
    */

    if (
      state === "reading"
    ) {

      state =
        "answer";


      mainButton.textContent =
        "💗 REVEAL ANSWER";

    }

  }
);


/* =========================================================
   PACKET SELECT
   ========================================================= */

packetSelect.addEventListener(
  "change",
  () => {

    loadPacket(
      Number(
        packetSelect.value
      )
    );

  }
);


/* =========================================================
   SUBJECT SELECT
   ========================================================= */

subjectSelect.addEventListener(
  "change",
  applySubjectFilter
);


/* =========================================================
   START
   ========================================================= */

loadPackets();
