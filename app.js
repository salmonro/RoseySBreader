pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";


// ==============================
// DATA
// ==============================

let packets = [];
let allQuestions = [];
let questions = [];

let current = 0;

let state = "question";

let speechRun = 0;


// ==============================
// TIMER
// ==============================

let timerInterval = null;
let timerTimeout = null;
let timerRun = 0;


// ==============================
// ELEMENTS
// ==============================

const packetButton =
  document.getElementById("packetButton");

const packetModal =
  document.getElementById("packetModal");

const closePacketModal =
  document.getElementById("closePacketModal");

const packetList =
  document.getElementById("packetList");


const subjectSelect =
  document.getElementById("subject");


const speedSelect =
  document.getElementById("speed");


const voiceSelect =
  document.getElementById("voice");


const info =
  document.getElementById("info");


const timerDiv =
  document.getElementById("timer");


const questionDiv =
  document.getElementById("question");


const answerDiv =
  document.getElementById("answer");


const mainButton =
  document.getElementById("mainButton");


const replayButton =
  document.getElementById("replay");


// ==============================
// CONTACT
// ==============================

const contactButton =
  document.getElementById("contactButton");


const contactModal =
  document.getElementById("contactModal");


const closeContact =
  document.getElementById("closeContact");


const copyDiscord =
  document.getElementById("copyDiscord");


const copyEmail =
  document.getElementById("copyEmail");


// ==============================
// SPEECH SETTINGS
// ==============================

const PAUSES = {

  betweenSections: 300,

  beforeChoices: 450,

  betweenChoices: 400

};


// ==============================
// VOICES
// ==============================

function loadVoices() {

  const voices =
    speechSynthesis.getVoices();

  voiceSelect.innerHTML = "";


  if (!voices.length) {

    const option =
      document.createElement("option");

    option.textContent =
      "Default voice";

    voiceSelect.appendChild(option);

    return;
  }


  const englishVoices =
    voices.filter(voice =>
      voice.lang
        .toLowerCase()
        .startsWith("en")
    );


  const otherVoices =
    voices.filter(voice =>
      !voice.lang
        .toLowerCase()
        .startsWith("en")
    );


  englishVoices.sort((a, b) => {

    function voicePriority(voice) {

      const name =
        voice.name.toLowerCase();

      if (
        name.includes("google") ||
        name.includes("chrome")
      ) {
        return 1;
      }

      if (
        name.includes("microsoft")
      ) {
        return 2;
      }

      if (
        name.includes("samantha") ||
        name.includes("alex") ||
        name.includes("ava") ||
        name.includes("siri")
      ) {
        return 3;
      }

      return 4;
    }

    return (
      voicePriority(a) -
      voicePriority(b)
    );

  });


  const sortedVoices = [
    ...englishVoices,
    ...otherVoices
  ];


  sortedVoices.forEach(voice => {

    const option =
      document.createElement("option");

    /*
      Keep the original speechSynthesis
      array index so getSelectedVoice()
      can retrieve the actual voice.
    */

    option.value =
      voices.indexOf(voice);

    option.textContent =
      `${voice.name} (${voice.lang})`;

    voiceSelect.appendChild(option);

  });

}


speechSynthesis.onvoiceschanged =
  loadVoices;


loadVoices();


// ==============================
// GET SELECTED VOICE
// ==============================

function getSelectedVoice() {

  const voices =
    speechSynthesis.getVoices();

  const index =
    Number(voiceSelect.value);

  return (
    voices[index] ||
    voices[0] ||
    null
  );

}


// ==============================
// READ PDF
// ==============================

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


    const items =
      content.items

        .filter(
          item =>
            item.str &&
            item.str.trim()
        )

        .map(item => ({

          text:
            item.str.trim(),

          x:
            item.transform[4],

          y:
            item.transform[5]

        }));


    const lines = [];


    for (const item of items) {

      let line =
        lines.find(
          existing =>
            Math.abs(
              existing.y -
              item.y
            ) < 3
        );


      if (!line) {

        line = {

          y:
            item.y,

          items:
            []

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
          .map(item =>
            item.text
          )
          .join(" ");

      });


    fullText +=
      "\n" +
      pageLines.join("\n");

  }


  return fullText;

}


// ==============================
// PARSE QUESTION
// ==============================

function parseQuestionBlock(
  block,
  type
) {

  const header =
    block.match(
      /(\d+)\)\s*(EARTH SCIENCE|GENERAL SCIENCE|BIOLOGY|CHEMISTRY|PHYSICS|ASTRONOMY|MATH)\s+(Short Answer|Multiple Choice)\b/i
    );


  if (!header) return null;


  const number =
    Number(header[1]);


  const subject =
    header[2]
      .trim()
      .toUpperCase();


  const format =
    header[3];


  let body =
    block

      .substring(
        header.index +
        header[0].length
      )

      .replace(/\r/g, "")

      .replace(
        /High School Round \d+ Page \d+/gi,
        ""
      );


  const lines =
    body

      .split("\n")

      .map(s =>
        s.trim()
      )

      .filter(Boolean);


  const answerIndex =
    lines.findIndex(
      line =>
        /^ANSWER\s*:/i.test(line)
    );


  const questionLines =
    answerIndex >= 0
      ? lines.slice(
          0,
          answerIndex
        )
      : lines;


  const answerLines =
    answerIndex >= 0

      ? [

          lines[answerIndex]
            .replace(
              /^ANSWER\s*:\s*/i,
              ""
            ),

          ...lines.slice(
            answerIndex + 1
          )

        ]

      : [];


  const choices = {

    W: "",

    X: "",

    Y: "",

    Z: ""

  };


  const stemLines = [];


  for (
    const line of questionLines
  ) {

    const match =
      line.match(
        /^([WXYZ])\)\s*(.*)$/i
      );


    if (match) {

      choices[
        match[1].toUpperCase()
      ] =
        match[2].trim();

    } else {

      stemLines.push(line);

    }

  }


  let answerParts = [];


  for (
    const line of answerLines
  ) {

    if (
      /^\(?Solution\b/i.test(line)
    ) {

      break;

    }


    answerParts.push(line);

  }


  let answer =
    answerParts

      .join(" ")

      .replace(
        /\s+/g,
        " "
      )

      .trim();


  if (
    format
      .toLowerCase()
      .includes("multiple")
  ) {

    const match =
      answer.match(
        /^([WXYZ])\)\s*(.*)$/i
      );


    if (match) {

      answer =
        `${match[1].toUpperCase()}) ${match[2].trim()}`;

    }

  }


  answer =
    answer

      .replace(
        /\s*\(ACCEPT:.*?\)/gi,
        ""
      )

      .trim();


  return {

    number,

    type,

    subject,

    format,

    text:
      stemLines

        .join(" ")

        .replace(
          /\s+/g,
          " "
        )

        .trim(),

    choices,

    answer

  };

}


// ==============================
// PARSE ALL QUESTIONS
// ==============================

function parseQuestions(text) {

  text =
    text.replace(
      /High School Round \d+ Page \d+/gi,
      ""
    );


  const lines =
    text

      .split("\n")

      .map(line =>
        line.trim()
      )

      .filter(Boolean);


  const results = [];


  let currentType = null;

  let currentBlock = [];


  function finishBlock() {

    if (
      !currentType ||
      !currentBlock.length
    ) {

      return;

    }


    const block =
      currentBlock.join("\n");


    const question =
      parseQuestionBlock(
        block,
        currentType
      );


    if (question) {

      results.push(question);

    }

  }


  for (
    const line of lines
  ) {

    if (
      /^TOSS-UP$/i.test(line)
    ) {

      finishBlock();


      currentType =
        "TOSS-UP";


      currentBlock = [];


      continue;

    }


    if (
      /^BONUS$/i.test(line)
    ) {

      finishBlock();


      currentType =
        "BONUS";


      currentBlock = [];


      continue;

    }


    if (currentType) {

      currentBlock.push(line);

    }

  }


  finishBlock();


  return results;

}


// ==============================
// LOAD PACKETS
// ==============================

async function loadPackets() {

  try {

    const response =
      await fetch(
        "/packets.json"
      );


    if (!response.ok) {

      throw new Error(
        "Could not load packets.json"
      );

    }


    packets =
      await response.json();


    renderPacketList();


    if (packets.length) {

      packetButton.textContent =
        `♡ ${packets[0].name}`;


      await loadPacket(0);

    }

  } catch (error) {

    console.error(error);

    info.textContent =
      "Could not load packets.";

  }

}


// ==============================
// RENDER PACKET LIST
// ==============================

function renderPacketList() {

  packetList.innerHTML = "";


  const groups = {};


  packets.forEach(
    (packet, index) => {

      const category =
        packet.category ||
        "Other";


      if (!groups[category]) {

        const section =
          document.createElement(
            "div"
          );

        section.className =
          "packet-section";


        const title =
          document.createElement(
            "div"
          );

        title.className =
          "packet-section-title";

        title.textContent =
          category;


        section.appendChild(title);


        const items =
          document.createElement(
            "div"
          );

        items.className =
          "packet-section-items";


        section.appendChild(items);


        groups[category] =
          items;


        packetList.appendChild(
          section
        );

      }


      const button =
        document.createElement(
          "button"
        );


      button.type =
        "button";


      button.className =
        "packet-option";


      button.innerHTML = `

        <span class="packet-option-name">
          ${escapeHTML(packet.name)}
        </span>

        <span class="packet-option-arrow">
          ›
        </span>

      `;


      button.addEventListener(
        "click",
        async () => {

          packetButton.textContent =
            `♡ ${packet.name}`;


          packetModal.classList.remove(
            "show"
          );


          await loadPacket(index);

        }
      );


      groups[category].appendChild(
        button
      );

    }
  );

}


// ==============================
// LOAD PACKET
// ==============================

async function loadPacket(index) {

  stopEverything();


  const packet =
    packets[index];


  if (!packet) return;


  try {

    info.textContent =
      "Loading packet...";


    const text =
      await readPDF(
        packet.file
      );


    allQuestions =
      parseQuestions(text);


    current = 0;


    buildSubjectList();


    applySubjectFilter();


  } catch (error) {

    console.error(error);

    info.textContent =
      "Could not load this packet.";

  }

}


// ==============================
// SUBJECT LIST
// ==============================

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
    `<option value="all">All Subjects</option>`;


  subjects.forEach(
    subject => {

      const option =
        document.createElement(
          "option"
        );


      option.value =
        subject;


      option.textContent =
        subject;


      subjectSelect.appendChild(
        option
      );

    }
  );

}


// ==============================
// FILTER
// ==============================

function applySubjectFilter() {

  const selected =
    subjectSelect.value;


  questions =
    selected === "all"

      ? [...allQuestions]

      : allQuestions.filter(
          q =>
            q.subject === selected
        );


  current = 0;


  showQuestion();

}


// ==============================
// DISPLAY QUESTION
// ==============================

function showQuestion() {

  stopEverything();


  answerDiv.innerHTML = "";


  timerDiv.innerHTML = "";


  timerDiv.className = "";


  state =
    "question";


  if (!questions.length) {

    info.textContent =
      "No questions found.";


    questionDiv.innerHTML =
      "";


    mainButton.textContent =
      "🔊 READ QUESTION";


    return;

  }


  if (
    current >= questions.length
  ) {

    info.textContent =
      "🎀 PACKET COMPLETE";


    questionDiv.innerHTML = `

      <div class="complete-message">
        ✦ Packet Complete ✦
      </div>

    `;


    mainButton.textContent =
      "🎀 COMPLETE";


    mainButton.disabled =
      true;


    return;

  }


  mainButton.disabled =
    false;


  const q =
    questions[current];


  info.textContent =
    `Question ${current + 1} of ${questions.length}`;


  questionDiv.innerHTML = `

    <div class="question-label">
      ${escapeHTML(q.subject)} ·
      ${escapeHTML(q.type)}
      ${escapeHTML(String(q.number))}
    </div>


    <div class="question-format">
      ${escapeHTML(q.format)}
    </div>


    <div class="question-text">
      ${escapeHTML(q.text)}
    </div>


    ${renderChoices(q)}

  `;


  mainButton.textContent =
    "🔊 READ QUESTION";

}


// ==============================
// RENDER CHOICES
// ==============================

function renderChoices(q) {

  if (
    !q.format ||
    !q.format
      .toLowerCase()
      .includes("multiple")
  ) {

    return "";

  }


  const letters =
    ["W", "X", "Y", "Z"];


  return `

    <div class="choices">

      ${letters.map(
        letter => `

          <div class="choice">

            <span class="choice-letter">
              ${letter}
            </span>

            <span class="choice-text">
              ${escapeHTML(
                q.choices[letter]
              )}
            </span>

          </div>

        `
      ).join("")}

    </div>

  `;

}


// ==============================
// ESCAPE HTML
// ==============================

function escapeHTML(text) {

  const div =
    document.createElement(
      "div"
    );


  div.textContent =
    text || "";


  return div.innerHTML;

}


// ==============================
// STOP EVERYTHING
// ==============================

function stopEverything() {

  speechRun++;

  timerRun++;


  speechSynthesis.cancel();


  clearInterval(
    timerInterval
  );


  clearTimeout(
    timerTimeout
  );


  timerInterval =
    null;


  timerTimeout =
    null;

}


// ==============================
// SPEAK CHUNK
// ==============================

function speakChunk(
  text,
  run
) {

  return new Promise(
    resolve => {

      if (
        run !== speechRun
      ) {

        resolve(false);

        return;

      }


      const utterance =
        new SpeechSynthesisUtterance(
          text
        );


      utterance.rate =
        Number(
          speedSelect.value
        );


      utterance.pitch =
        1;


      const voice =
        getSelectedVoice();


      if (voice) {

        utterance.voice =
          voice;

      }


      utterance.onend =
        () => {

          resolve(
            run === speechRun
          );

        };


      utterance.onerror =
        () => {

          resolve(false);

        };


      speechSynthesis.speak(
        utterance
      );

    }
  );

}


// ==============================
// SMALL NATURAL PAUSE
// ==============================

function naturalPause(
  ms,
  run
) {

  return new Promise(
    resolve => {

      setTimeout(
        () => {

          resolve(
            run === speechRun
          );

        },
        ms
      );

    }
  );

}


// ==============================
// SPEAK TEXT NATURALLY
// ==============================

async function speakNatural(
  text,
  run
) {

  if (
    !text ||
    run !== speechRun
  ) {

    return false;

  }


  return await speakChunk(
    text,
    run
  );

}


// ==============================
// READ SCIENCE BOWL QUESTION
// ==============================

async function speakScienceBowlQuestion(q) {

  stopEverything();


  const run =
    speechRun;


  state =
    "reading";


  mainButton.textContent =
    "⏹ INTERRUPT";


  // SUBJECT

  let ok =
    await speakNatural(
      q.subject,
      run
    );


  if (!ok) return;


  ok =
    await naturalPause(
      PAUSES.betweenSections,
      run
    );


  if (!ok) return;


  // TOSS-UP / BONUS

  ok =
    await speakNatural(

      q.type === "TOSS-UP"

        ? `Toss-up ${q.number}`

        : `Bonus ${q.number}`,

      run

    );


  if (!ok) return;


  ok =
    await naturalPause(
      PAUSES.betweenSections,
      run
    );


  if (!ok) return;


  // FORMAT

  ok =
    await speakNatural(
      q.format,
      run
    );


  if (!ok) return;


  ok =
    await naturalPause(
      PAUSES.betweenSections,
      run
    );


  if (!ok) return;


  // QUESTION

  ok =
    await speakNatural(
      q.text,
      run
    );


  if (!ok) return;


  // MULTIPLE CHOICE

  const isMultipleChoice =
    q.format
      .toLowerCase()
      .includes("multiple");


  if (isMultipleChoice) {

    ok =
      await naturalPause(
        PAUSES.beforeChoices,
        run
      );


    if (!ok) return;


    const letters =
      ["W", "X", "Y", "Z"];


    for (
      let i = 0;
      i < letters.length;
      i++
    ) {

      const letter =
        letters[i];


      const choice =
        q.choices[letter];


      if (!choice) continue;


      /*
        Say each letter separately.

        This makes the speech say:

        "w"

        rather than:

        "double-u"
      */

      ok =
        await speakNatural(
          letter.toLowerCase(),
          run
        );


      if (!ok) return;


      ok =
        await naturalPause(
          80,
          run
        );


      if (!ok) return;


      ok =
        await speakNatural(
          choice,
          run
        );


      if (!ok) return;


      if (
        i <
        letters.length - 1
      ) {

        ok =
          await naturalPause(
            PAUSES.betweenChoices,
            run
          );


        if (!ok) return;

      }

    }

  }


  if (
    run !== speechRun
  ) {

    return;

  }


  // QUESTION IS FULLY READ

  state =
    "answer";


  mainButton.textContent =
    "💗 REVEAL ANSWER";


  // START TIMER

  startAnswerTimer(q);

}


// ==============================
// START 5 / 20 SECOND TIMER
// ==============================

function startAnswerTimer(q) {

  clearInterval(
    timerInterval
  );


  clearTimeout(
    timerTimeout
  );


  timerRun++;


  const thisTimer =
    timerRun;


  const totalSeconds =
    q.type === "TOSS-UP"
      ? 5
      : 20;


  let remaining =
    totalSeconds;


  timerDiv.className =
    "";


  timerDiv.textContent =
    remaining;


  timerInterval =
    setInterval(
      () => {

        if (
          thisTimer !== timerRun
        ) {

          clearInterval(
            timerInterval
          );

          return;

        }


        remaining--;


        if (
          remaining <= 0
        ) {

          clearInterval(
            timerInterval
          );


          timerInterval =
            null;


          timerDiv.textContent =
            "TIME'S UP!";


          timerDiv.classList.add(
            "timer-up"
          );


          speakTimeUp();


          return;

        }


        timerDiv.textContent =
          remaining;


        if (
          remaining <= 3
        ) {

          timerDiv.classList.add(
            "timer-warning"
          );

        }

      },
      1000
    );

}


// ==============================
// TIME'S UP VOICE
// ==============================

function speakTimeUp() {

  speechRun++;


  speechSynthesis.cancel();


  const utterance =
    new SpeechSynthesisUtterance(
      "Time's up!"
    );


  utterance.rate =
    Number(
      speedSelect.value
    );


  utterance.pitch =
    1;


  const voice =
    getSelectedVoice();


  if (voice) {

    utterance.voice =
      voice;

  }


  speechSynthesis.speak(
    utterance
  );

}


// ==============================
// REVEAL ANSWER
// ==============================

function revealAnswer() {

  const q =
    questions[current];


  if (!q) return;


  // STOP COUNTDOWN

  timerRun++;


  clearInterval(
    timerInterval
  );


  clearTimeout(
    timerTimeout
  );


  timerInterval =
    null;


  timerTimeout =
    null;


  timerDiv.innerHTML =
    "";


  timerDiv.className =
    "";


  state =
    "revealing";


  answerDiv.innerHTML = `

    <div class="answer-card">

      <span class="answer-label">
        ANSWER
      </span>

      <span class="answer-text">
        ${escapeHTML(q.answer)}
      </span>

    </div>

  `;


  mainButton.textContent =
    "✨ NEXT QUESTION";


  speechRun++;


  speechSynthesis.cancel();


  const spokenAnswer =
    q.answer
      .replace(
        /^([WXYZ])\)\s*/i,
        match =>
          `${match[1].toLowerCase()}. `
      );


  const utterance =
    new SpeechSynthesisUtterance(
      `The answer is ${spokenAnswer}`
    );


  utterance.rate =
    Number(
      speedSelect.value
    );


  utterance.pitch =
    1;


  const voice =
    getSelectedVoice();


  if (voice) {

    utterance.voice =
      voice;

  }


  speechSynthesis.speak(
    utterance
  );


  state =
    "next";

}


// ==============================
// MAIN BUTTON
// ==============================

mainButton.addEventListener(
  "click",
  () => {

    if (!questions.length) {
      return;
    }


    // READ

    if (
      state === "question"
    ) {

      speakScienceBowlQuestion(
        questions[current]
      );

      return;

    }


    // INTERRUPT

    if (
      state === "reading"
    ) {

      stopEverything();


      state =
        "answer";


      mainButton.textContent =
        "💗 REVEAL ANSWER";


      return;

    }


    // REVEAL

    if (
      state === "answer"
    ) {

      revealAnswer();

      return;

    }


    // NEXT

    if (
      state === "next"
    ) {

      current++;


      showQuestion();


      return;

    }

  }
);


// ==============================
// REPLAY
// ==============================

replayButton.addEventListener(
  "click",
  () => {

    if (!questions.length) {
      return;
    }


    speakScienceBowlQuestion(
      questions[current]
    );

  }
);


// ==============================
// PACKET POPUP
// ==============================

packetButton.addEventListener(
  "click",
  () => {

    packetModal.classList.add(
      "show"
    );

  }
);


closePacketModal.addEventListener(
  "click",
  () => {

    packetModal.classList.remove(
      "show"
    );

  }
);


packetModal.addEventListener(
  "click",
  event => {

    if (
      event.target === packetModal
    ) {

      packetModal.classList.remove(
        "show"
      );

    }

  }
);


// ==============================
// SUBJECT CHANGE
// ==============================

subjectSelect.addEventListener(
  "change",
  () => {

    applySubjectFilter();

  }
);


// ==============================
// CONTACT POPUP
// ==============================

contactButton.addEventListener(
  "click",
  () => {

    contactModal.classList.add(
      "show"
    );

  }
);


closeContact.addEventListener(
  "click",
  () => {

    contactModal.classList.remove(
      "show"
    );

  }
);


contactModal.addEventListener(
  "click",
  event => {

    if (
      event.target ===
      contactModal
    ) {

      contactModal.classList.remove(
        "show"
      );

    }

  }
);


// ==============================
// COPY DISCORD
// ==============================

copyDiscord.addEventListener(
  "click",
  async () => {

    try {

      await navigator.clipboard.writeText(
        "@argi9"
      );


      const originalText =
        copyDiscord.textContent;


      copyDiscord.textContent =
        "copied ♡";


      setTimeout(
        () => {

          copyDiscord.textContent =
            originalText;

        },
        1500
      );


    } catch (error) {

      console.error(
        "Could not copy Discord username:",
        error
      );

    }

  }
);


// ==============================
// COPY EMAIL
// ==============================

copyEmail.addEventListener(
  "click",
  async () => {

    try {

      await navigator.clipboard.writeText(
        "tinosciencebowl@gmail.com"
      );


      const originalText =
        copyEmail.textContent;


      copyEmail.textContent =
        "copied ♡";


      setTimeout(
        () => {

          copyEmail.textContent =
            originalText;

        },
        1500
      );


    } catch (error) {

      console.error(
        "Could not copy email:",
        error
      );

    }

  }
);


// ==============================
// START
// ==============================

loadPackets();
