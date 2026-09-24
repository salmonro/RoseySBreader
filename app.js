```javascript
import * as pdfjsLib from
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

let packets = [];
let questions = [];
let current = 0;
let state = "question";

const packetSelect = document.getElementById("packet");
const subjectSelect = document.getElementById("subject");
const speedSelect = document.getElementById("speed");
const voiceSelect = document.getElementById("voice");

const questionDiv = document.getElementById("question");
const answerDiv = document.getElementById("answer");
const infoDiv = document.getElementById("info");

const mainButton = document.getElementById("mainButton");
const replayButton = document.getElementById("replay");


// -------------------------
// VOICES
// -------------------------

function loadVoices() {
  const voices = speechSynthesis
    .getVoices()
    .filter(v => v.lang.startsWith("en"));

  voiceSelect.innerHTML = "";

  voices.forEach((voice, i) => {
    const option = document.createElement("option");

    option.value = i;
    option.textContent = voice.name;

    voiceSelect.appendChild(option);
  });
}

speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();


// -------------------------
// SPEECH
// -------------------------

function speak(text) {
  speechSynthesis.cancel();

  const speech = new SpeechSynthesisUtterance(text);

  speech.rate = Number(speedSelect.value);

  const voices = speechSynthesis
    .getVoices()
    .filter(v => v.lang.startsWith("en"));

  if (voices[voiceSelect.value]) {
    speech.voice = voices[voiceSelect.value];
  }

  speechSynthesis.speak(speech);
}


// -------------------------
// PDF TEXT EXTRACTION
// -------------------------

async function readPDF(url) {

  const pdf = await pdfjsLib.getDocument(url).promise;

  let pages = [];

  for (let i = 1; i <= pdf.numPages; i++) {

    const page = await pdf.getPage(i);

    const content = await page.getTextContent();

    const text = content.items
      .map(item => item.str)
      .join(" ");

    pages.push(text);
  }

  return pages.join("\n");
}


// -------------------------
// BASIC QUESTION PARSER
// -------------------------

function parseQuestions(text) {

  const results = [];

  /*
    This parser expects something roughly like:

    1) Question text...
    W. option
    X. option
    Y. option
    Z. option
    ANSWER: W
  */

  const chunks = text.split(
    /(?:^|\s)(?:Question\s*)?\d+[\.\):]/gi
  );

  for (const chunk of chunks) {

    if (chunk.trim().length < 30)
      continue;

    const answerMatch =
      chunk.match(/(?:ANSWER|Answer|ANS)\s*[:\-]?\s*([WXYZ])/i);

    const choiceMatch =
      chunk.match(
        /W[\.\)]\s*(.*?)\s+X[\.\)]\s*(.*?)\s+Y[\.\)]\s*(.*?)\s+Z[\.\)]\s*(.*?)(?=\s+(?:ANSWER|Answer|ANS)\b|$)/is
      );

    let question = chunk;
    let choices = null;
    let answer = "";

    if (answerMatch) {
      answer = answerMatch[1].toUpperCase();
    }

    if (choiceMatch) {

      choices = {
        W: choiceMatch[1].trim(),
        X: choiceMatch[2].trim(),
        Y: choiceMatch[3].trim(),
        Z: choiceMatch[4].trim()
      };

      question = chunk.substring(
        0,
        chunk.search(/W[\.\)]/i)
      );
    }

    results.push({
      subject: detectSubject(question),
      type: "Toss-Up",
      question: question.trim(),
      choices,
      answer
    });
  }

  return results;
}


// -------------------------
// SUBJECT DETECTION
// -------------------------

function detectSubject(text) {

  const t = text.toLowerCase();

  if (
    /cell|gene|protein|organism|enzyme|dna|rna|biology|ecology/.test(t)
  )
    return "Biology";

  if (
    /atom|molecule|reaction|chemical|acid|base|chemistry/.test(t)
  )
    return "Chemistry";

  if (
    /force|velocity|acceleration|energy|momentum|electric|physics/.test(t)
  )
    return "Physics";

  if (
    /equation|integer|function|geometry|probability|math/.test(t)
  )
    return "Math";

  if (
    /planet|star|earth|geology|atmosphere|astronomy/.test(t)
  )
    return "Earth Science";

  return "Other";
}


// -------------------------
// LOAD PACKET
// -------------------------

async function loadPacket(index) {

  infoDiv.textContent = "Loading packet...";

  const packet = packets[index];

  const text = await readPDF(packet.file);

  questions = parseQuestions(text);

  current = 0;

  filterQuestions();

}


// -------------------------
// FILTER
// -------------------------

function filterQuestions() {

  const packet = packets[packetSelect.value];

  const textQuestions =
    questions.length
      ? questions
      : [];

  if (subjectSelect.value === "all") {
    questions = textQuestions;
  }

  showQuestion();
}


// -------------------------
// SHOW QUESTION
// -------------------------

function showQuestion() {

  if (!questions[current]) {

    questionDiv.textContent = "Packet finished!";
    answerDiv.textContent = "";

    mainButton.textContent = "START OVER";

    return;
  }

  const q = questions[current];

  infoDiv.textContent =
    `${q.subject} • ${q.type} • ${current + 1}/${questions.length}`;

  let html = `<p>${q.question}</p>`;

  if (q.choices) {

    html += `
      <p>
        W. ${q.choices.W}<br>
        X. ${q.choices.X}<br>
        Y. ${q.choices.Y}<br>
        Z. ${q.choices.Z}
      </p>
    `;
  }

  questionDiv.innerHTML = html;

  answerDiv.textContent = "";

  mainButton.textContent = "🔊 READ QUESTION";

  state = "question";
}


// -------------------------
// READ QUESTION
// -------------------------

function readQuestion() {

  const q = questions[current];

  let text = q.question;

  if (q.choices) {

    text +=
      ` W. ${q.choices.W}` +
      ` X. ${q.choices.X}` +
      ` Y. ${q.choices.Y}` +
      ` Z. ${q.choices.Z}`;
  }

  speak(text);
}


// -------------------------
// REVEAL
// -------------------------

function revealAnswer() {

  const q = questions[current];

  answerDiv.textContent =
    `ANSWER: ${q.answer}`;

  let text = `The answer is ${q.answer}.`;

  if (q.choices && q.choices[q.answer]) {
    text += ` ${q.choices[q.answer]}.`;
  }

  speak(text);

  mainButton.textContent = "NEXT QUESTION";

  state = "answer";
}


// -------------------------
// MAIN BUTTON
// -------------------------

mainButton.onclick = () => {

  if (state === "question") {

    readQuestion();

    mainButton.textContent =
      "REVEAL ANSWER";

    state = "ready";

  } else if (state === "ready") {

    revealAnswer();

  } else if (state === "answer") {

    current++;

    showQuestion();
  }

};


// -------------------------
// REPLAY
// -------------------------

replayButton.onclick = () => {

  if (questions[current]) {
    readQuestion();
  }

};


// -------------------------
// DROPDOWNS
// -------------------------

packetSelect.onchange = () => {
  loadPacket(packetSelect.value);
};

subjectSelect.onchange = () => {

  if (subjectSelect.value === "all") {
    showQuestion();
    return;
  }

  const selected = subjectSelect.value;

  questions = questions.filter(
    q => q.subject === selected
  );

  current = 0;

  showQuestion();
};


// -------------------------
// SPACEBAR
// -------------------------

document.addEventListener("keydown", e => {

  if (e.code === "Space") {

    e.preventDefault();

    mainButton.click();
  }

});


// -------------------------
// LOAD PACKET LIST
// -------------------------

async function initialize() {

  const response =
    await fetch("/packets.json");

  packets = await response.json();

  packetSelect.innerHTML = "";

  packets.forEach((packet, i) => {

    const option =
      document.createElement("option");

    option.value = i;
    option.textContent = packet.name;

    packetSelect.appendChild(option);
  });

  await loadPacket(0);
}

initialize();
```
