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

let state = "question";

let lastSpeech = "";


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

const replayButton =
  document.getElementById("replay");


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
      voice.lang.toLowerCase().startsWith("en")
    );

  englishVoices.forEach((voice, index) => {

    const option =
      document.createElement("option");

    option.value = index;

    option.textContent =
      voice.name;

    voiceSelect.appendChild(option);

  });

}


speechSynthesis.onvoiceschanged =
  loadVoices;

loadVoices();


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
      PDF.js sometimes returns pieces of text
      in weird visual order.

      We use the y-coordinate to reconstruct
      lines before joining them.
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


    items.sort((a, b) => {

      if (
        Math.abs(a.y - b.y) > 3
      ) {

        return b.y - a.y;

      }

      return a.x - b.x;

    });


    const lines = [];

    for (const item of items) {

      let line =
        lines.find(existing =>
          Math.abs(existing.y - item.y) < 3
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


    lines.sort((a, b) =>
      b.y - a.y
    );


    const pageLines =
      lines.map(line => {

        line.items.sort(
          (a, b) => a.x - b.x
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

    .replace(/\s+/g, " ")

    .replace(
      /High School Round \d+ Page \d+/gi,
      ""
    )

    .trim();

}


/* =========================================================
   PARSE ANSWER
   ========================================================= */

function extractAnswer(text) {

  const match =
    text.match(
      /ANSWER\s*:\s*(.*?)(?=\s*(?:TOSS-UP|BONUS|\d+\)\s+[A-Z]))/i
    );

  if (!match) {

    const simple =
      text.match(
        /ANSWER\s*:\s*(.+)$/i
      );

    return simple
      ? simple[1].trim()
      : "";

  }

  return match[1].trim();

}


/* =========================================================
   PARSE ONE QUESTION
   ========================================================= */

function parseQuestionBlock(
  block,
  type
) {

  /*
    Example from the packet:

    TOSS-UP
    1) BIOLOGY Multiple Choice
    ...
    ANSWER: W) BASIC
  */


  const header =
    block.match(
      /(\d+)\)\s*([A-Z][A-Z ]+?)\s+(Short Answer|Multiple Choice)\b/i
    );


  if (!header) {

    return null;

  }


  const number =
    Number(header[1]);


  const subject =
    header[2]
      .trim()
      .replace(/\s+/g, " ")
      .toUpperCase();


  const format =
    header[3];


  /*
    Everything after the format is
    the actual question material.
  */

  let body =
    block.substring(
      header.index + header[0].length
    );


  body =
    cleanText(body);


  /*
    Split question from answer.
  */

  const answerIndex =
    body.search(
      /\bANSWER\s*:/i
    );


  let questionText;

  let answer = "";


  if (answerIndex >= 0) {

    questionText =
      body.substring(
        0,
        answerIndex
      ).trim();

    answer =
      body.substring(
        answerIndex
      );

    answer =
      extractAnswer(answer);

  } else {

    questionText =
      body;

  }


  /*
    Remove solution text.
  */

  questionText =
    questionText.replace(
      /\s*\(Solution:.*$/i,
      ""
    );


  /*
    Remove ACCEPT information
    if it accidentally appears
    in the question section.
  */

  questionText =
    questionText.replace(
      /\s*\(ACCEPT:.*?\)/gi,
      ""
    );


  /*
    Find multiple-choice answers.
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
        choiceRegex.exec(questionText))
    ) {

      choices[
        match[1].toUpperCase()
      ] =
        match[2].trim();

    }


    /*
      Remove choices from the
      question text itself.

      They remain stored separately
      so the speech function can
      read them cleanly.
    */

    questionText =
      questionText.replace(
        /\s+[WXYZ]\)\s+.*?(?=\s+[WXYZ]\)\s|$)/gi,
        ""
      ).trim();

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

  /*
    Normalize line breaks.
  */

  text =
    text
      .replace(/\r/g, "")
      .replace(
        /High School Round \d+ Page \d+/gi,
        ""
      );


  /*
    Find every TOSS-UP or BONUS.

    This is much safer than looking
    for arbitrary question numbers.
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


    /*
      Remove the marker itself.
    */

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


    packetSelect.innerHTML = "";


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
   LOAD ONE PACKET
   ========================================================= */

async function loadPacket(index) {

  try {

    speechSynthesis.cancel();

    current = 0;

    state = "question";

    answerDiv.textContent = "";


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
   SUBJECT DROPDOWN
   ========================================================= */

function buildSubjectList() {

  const subjects =
    [
      ...new Set(
        allQuestions.map(
          question =>
            question.subject
        )
      )
    ];


  subjectSelect.innerHTML = "";

  const allOption =
    document.createElement(
      "option"
    );

  allOption.value = "all";

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
        question =>
          question.subject ===
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

  speechSynthesis.cancel();

  answerDiv.textContent = "";


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


  mainButton.textContent =
    "🔊 READ QUESTION";


  state = "question";

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

      ${renderChoice("W", q.choices.W)}
      ${renderChoice("X", q.choices.X)}
      ${renderChoice("Y", q.choices.Y)}
      ${renderChoice("Z", q.choices.Z)}

    </div>

  `;

}


function renderChoice(letter, text) {

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
   HTML ESCAPE
   ========================================================= */

function escapeHTML(text) {

  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}


/* =========================================================
   SPEECH
   ========================================================= */

function speak(text) {

  speechSynthesis.cancel();


  const utterance =
    new SpeechSynthesisUtterance(
      text
    );


  utterance.rate =
    Number(speedSelect.value);


  const voices =
    speechSynthesis.getVoices();


  const englishVoices =
    voices.filter(
      voice =>
        voice.lang &&
        voice.lang
          .toLowerCase()
          .startsWith("en")
    );


  const selectedVoice =
    englishVoices[
      voiceSelect.selectedIndex
    ];


  if (selectedVoice) {

    utterance.voice =
      selectedVoice;

  }


  lastSpeech =
    text;


  speechSynthesis.speak(
    utterance
  );

}


/* =========================================================
   READ CURRENT QUESTION
   ========================================================= */

function readCurrentQuestion() {

  const q =
    questions[current];


  if (!q) return;


  let speech = "";


  speech +=
    `${formatSubject(q.subject)} `;


  speech +=
    `${q.type === "TOSS-UP"
      ? "toss-up"
      : "bonus"} `;


  speech +=
    `${q.number}. `;


  speech +=
    `${q.format}. `;


  speech +=
    q.text;


  /*
    Read choices in order.
  */

  if (q.choices.W) {

    speech +=
      ` W. ${q.choices.W}`;

  }

  if (q.choices.X) {

    speech +=
      ` X. ${q.choices.X}`;

  }

  if (q.choices.Y) {

    speech +=
      ` Y. ${q.choices.Y}`;

  }

  if (q.choices.Z) {

    speech +=
      ` Z. ${q.choices.Z}`;

  }


  speak(speech);

}


/* =========================================================
   REVEAL ANSWER
   ========================================================= */

function revealAnswer() {

  const q =
    questions[current];


  if (!q) return;


  if (!q.answer) {

    answerDiv.textContent =
      "Answer not detected.";

    return;

  }


  answerDiv.textContent =
    `Answer: ${q.answer}`;


  speak(
    `The answer is ${q.answer}`
  );

}


/* =========================================================
   MAIN BUTTON
   ========================================================= */

mainButton.addEventListener(
  "click",
  () => {

    if (
      !questions.length
    ) return;


    if (
      state === "question"
    ) {

      readCurrentQuestion();

      state = "answer";

      mainButton.textContent =
        "💗 REVEAL ANSWER";

      return;

    }


    if (
      state === "answer"
    ) {

      revealAnswer();

      state = "next";

      mainButton.textContent =
        "✨ NEXT QUESTION";

      return;

    }


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
   REPLAY
   ========================================================= */

replayButton.addEventListener(
  "click",
  () => {

    if (lastSpeech) {

      speak(lastSpeech);

    } else {

      readCurrentQuestion();

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
