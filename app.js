pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

let packets = [];
let allQuestions = [];
let questions = [];
let current = 0;
let state = "question";
let lastSpeech = "";

const packetSelect = document.getElementById("packet");
const subjectSelect = document.getElementById("subject");
const speedSelect = document.getElementById("speed");
const voiceSelect = document.getElementById("voice");

const info = document.getElementById("info");
const questionDiv = document.getElementById("question");
const answerDiv = document.getElementById("answer");

const mainButton = document.getElementById("mainButton");
const replayButton = document.getElementById("replay");


/* ---------------- VOICES ---------------- */

function loadVoices() {
  const voices = speechSynthesis.getVoices();

  voiceSelect.innerHTML = "";

  voices
    .filter(v => v.lang.startsWith("en"))
    .forEach((voice, i) => {
      const option = document.createElement("option");
      option.value = i;
      option.textContent = voice.name;
      voiceSelect.appendChild(option);
    });
}

speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();


/* ---------------- PDF READER ---------------- */

async function readPDF(url) {

  info.textContent = "Loading PDF...";

  const pdf = await pdfjsLib
    .getDocument(url)
    .promise;

  let fullText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {

    info.textContent =
      `Reading PDF... page ${pageNum}/${pdf.numPages}`;

    const page = await pdf.getPage(pageNum);

    const content = await page.getTextContent();

    const text = content.items
      .map(item => item.str)
      .join(" ");

    fullText += "\n" + text;
  }

  return fullText;
}


/* ---------------- QUESTION PARSER ---------------- */

function parseQuestions(text) {

  const results = [];

  // Try to find numbered questions.
  const chunks = text.split(
    /(?=(?:Question\s*)?\d{1,3}[\.\):]\s)/gi
  );

  for (const chunk of chunks) {

    const match = chunk.match(
      /^(?:Question\s*)?(\d{1,3})[\.\):]\s*(.*)/is
    );

    if (!match) continue;

    const number = match[1];
    let body = match[2].replace(/\s+/g, " ").trim();

    if (body.length < 20) continue;

    // Find answer choices.
    const choiceMatch = body.match(
      /(?:^|\s)(?:W[\.\):]\s*)(.*?)(?:\s+X[\.\):]\s*)(.*?)(?:\s+Y[\.\):]\s*)(.*?)(?:\s+Z[\.\):]\s*)(.*?)(?=$)/i
    );

    let choices = {
      W: "",
      X: "",
      Y: "",
      Z: ""
    };

    if (choiceMatch) {
      choices = {
        W: choiceMatch[1].trim(),
        X: choiceMatch[2].trim(),
        Y: choiceMatch[3].trim(),
        Z: choiceMatch[4].trim()
      };
    }

    // Try to detect answer.
    const answerMatch = body.match(
      /(?:answer|ans\.?)\s*[:\-]?\s*([WXYZ])/i
    );

    const answer = answerMatch
      ? answerMatch[1].toUpperCase()
      : "";

    // Remove answer key text from displayed question.
    body = body
      .replace(
        /(?:answer|ans\.?)\s*[:\-]?\s*[WXYZ]/gi,
        ""
      )
      .trim();

    results.push({
      number,
      text: body,
      choices,
      answer
    });
  }

  return results;
}


/* ---------------- PACKETS ---------------- */

async function loadPackets() {

  try {

    const response = await fetch("/packets.json");

    if (!response.ok) {
      throw new Error("Could not load packets.json");
    }

    packets = await response.json();

    packetSelect.innerHTML = "";

    packets.forEach((packet, index) => {

      const option = document.createElement("option");

      option.value = index;
      option.textContent = packet.name;

      packetSelect.appendChild(option);
    });

    await loadPacket(0);

  } catch (error) {

    console.error(error);

    info.textContent = "Error loading packets.";
    questionDiv.textContent = error.message;
  }
}


async function loadPacket(index) {

  try {

    speechSynthesis.cancel();

    current = 0;
    state = "question";

    answerDiv.textContent = "";

    info.textContent = "Loading packet...";

    const text = await readPDF(
      packets[index].file
    );

    console.log("PDF TEXT:", text);

    allQuestions = parseQuestions(text);

    console.log(
      "QUESTIONS FOUND:",
      allQuestions.length
    );

    applySubjectFilter();

  } catch (error) {

    console.error(error);

    info.textContent = "Could not load PDF.";
    questionDiv.textContent =
      error.message;

  }
}


/* ---------------- FILTER ---------------- */

function applySubjectFilter() {

  const subject = subjectSelect.value;

  if (subject === "all") {
    questions = [...allQuestions];
  } else {

    // For now, keep all questions because
    // packet subject formatting varies.
    questions = [...allQuestions];
  }

  current = 0;
  state = "question";

  showQuestion();
}


/* ---------------- DISPLAY ---------------- */

function showQuestion() {

  if (!questions.length) {

    questionDiv.textContent =
      "No questions found.";

    info.textContent =
      "The PDF loaded, but the question parser did not find any questions.";

    mainButton.textContent =
      "READ QUESTION";

    return;
  }

  const q = questions[current];

  questionDiv.innerHTML = `
    <strong>Question ${q.number}</strong>
    <br><br>
    ${escapeHTML(q.text)}
  `;

  answerDiv.textContent = "";

  info.textContent =
    `Question ${current + 1} of ${questions.length}`;

  mainButton.textContent =
    "🔊 READ QUESTION";

  state = "question";
}


function escapeHTML(text) {

  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}


/* ---------------- SPEECH ---------------- */

function speak(text) {

  speechSynthesis.cancel();

  const utterance =
    new SpeechSynthesisUtterance(text);

  utterance.rate =
    Number(speedSelect.value);

  const voices =
    speechSynthesis.getVoices();

  const selected =
    voices.filter(v =>
      v.lang.startsWith("en")
    )[voiceSelect.selectedIndex];

  if (selected) {
    utterance.voice = selected;
  }

  lastSpeech = text;

  speechSynthesis.speak(utterance);
}


function readCurrentQuestion() {

  const q = questions[current];

  if (!q) return;

  let speech = q.text;

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


/* ---------------- BUTTON ---------------- */

mainButton.addEventListener("click", () => {

  if (!questions.length) return;

  const q = questions[current];

  if (state === "question") {

    readCurrentQuestion();

    state = "answer";

    mainButton.textContent =
      "REVEAL ANSWER";

    return;
  }

  if (state === "answer") {

    if (q.answer) {

      answerDiv.textContent =
        `Answer: ${q.answer}`;

      speak(
        `The answer is ${q.answer}`
      );

    } else {

      answerDiv.textContent =
        "Answer not detected in PDF.";

    }

    state = "next";

    mainButton.textContent =
      "NEXT QUESTION";

    return;
  }

  if (state === "next") {

    if (current < questions.length - 1) {

      current++;

      showQuestion();

    } else {

      info.textContent =
        "End of packet.";

      mainButton.textContent =
        "PACKET COMPLETE";

    }
  }
});


/* ---------------- REPLAY ---------------- */

replayButton.addEventListener("click", () => {

  if (lastSpeech) {
    speak(lastSpeech);
  } else {
    readCurrentQuestion();
  }

});


/* ---------------- CONTROLS ---------------- */

packetSelect.addEventListener("change", () => {

  loadPacket(
    Number(packetSelect.value)
  );

});


subjectSelect.addEventListener(
  "change",
  applySubjectFilter
);


/* ---------------- START ---------------- */

loadPackets();
