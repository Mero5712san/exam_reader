const STORAGE_KEY = "examreader_payload";

const form = document.getElementById("fetch-form");
const tokenInput = document.getElementById("token");
const urlInput = document.getElementById("url");
const statusEl = document.getElementById("status");
const submitBtn = document.getElementById("fetch-btn");

const metaEl = document.getElementById("meta");
const qaListEl = document.getElementById("qa-list");
const template = document.getElementById("qa-template");
const printBtn = document.getElementById("print-btn");

function toHtmlContent(htmlLike) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = htmlLike || "";

    // Remove noisy inline style attributes from generated HTML.
    wrapper.querySelectorAll("*").forEach((node) => {
        node.removeAttribute("style");
        node.removeAttribute("id");
        if (node.tagName === "SPAN" && node.textContent.trim() === "") {
            node.remove();
        }
    });

    return wrapper.innerHTML.trim();
}

function textOrFallback(htmlLike, fallbackText) {
    const content = toHtmlContent(htmlLike);
    return content || `<p>${fallbackText}</p>`;
}

function setStatus(message, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = isError ? "#a32020" : "#5c6770";
}

function clearResults() {
    if (!qaListEl || !metaEl) return;
    qaListEl.innerHTML = "";
    metaEl.innerHTML = "";
    metaEl.classList.add("hidden");
}

function renderMeta(data) {
    if (!metaEl) return;
    const bits = [];
    if (data.exam_name) bits.push(`<strong>${data.exam_name}</strong>`);
    if (data.course_name) bits.push(data.course_name);
    if (data.exam_month) bits.push(data.exam_month);

    if (!bits.length) {
        metaEl.classList.add("hidden");
        return;
    }

    metaEl.innerHTML = bits.map((part) => `<div>${part}</div>`).join("");
    metaEl.classList.remove("hidden");
}

function renderQuestions(questions) {
    if (!qaListEl || !template) return;
    qaListEl.innerHTML = "";

    questions.forEach((q, index) => {
        const clone = template.content.cloneNode(true);
        const qNo = clone.querySelector(".qno");
        const marks = clone.querySelector(".marks");
        const qBody = clone.querySelector(".question");
        const answer = clone.querySelector(".answer");

        qNo.textContent = String(index + 1);
        marks.textContent = q.mark ? `${q.mark} mark(s)` : "";

        qBody.innerHTML = textOrFallback(q.question, "Question not available.");

        const answerText = q.answer && String(q.answer).trim()
            ? q.answer
            : (q.show_answer ? "Answer is empty." : "Answer not available (hidden by source).");

        answer.innerHTML = textOrFallback(answerText, "No answer.");

        qaListEl.appendChild(clone);
    });
}

async function fetchData(token, url) {
    const response = await fetch("/api/fetch-exam", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ token, url })
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || "Failed to fetch response");
    }

    return data.response;
}

function renderStoredPayload() {
    let raw;
    try {
        raw = sessionStorage.getItem(STORAGE_KEY);
    } catch (error) {
        setStatus("Unable to access browser storage.", true);
        return;
    }

    if (!raw) {
        setStatus("No fetched data found. Please fetch from the home page first.", true);
        return;
    }

    let payload;
    try {
        payload = JSON.parse(raw);
    } catch (error) {
        setStatus("Saved response is invalid. Fetch again from the home page.", true);
        return;
    }

    const exam = payload && payload.data ? payload.data : payload;
    const questions = Array.isArray(exam.questions) ? exam.questions : [];

    renderMeta(exam);

    if (!questions.length) {
        setStatus("No questions found in the response.", true);
        return;
    }

    renderQuestions(questions);
    setStatus(`Loaded ${questions.length} question(s).`);
}

if (form) {
    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const token = tokenInput.value.trim();
        const url = urlInput.value.trim();

        if (!url) {
            setStatus("Please provide a URL or curl command.", true);
            return;
        }

        submitBtn.disabled = true;
        setStatus("Fetching response...");

        try {
            const payload = await fetchData(token, url);
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
            window.location.href = "/questions.html";
        } catch (error) {
            setStatus(error.message || "Unexpected error occurred.", true);
        } finally {
            submitBtn.disabled = false;
        }
    });
}

if (qaListEl && template && !form) {
    clearResults();
    renderStoredPayload();
}

if (printBtn) {
    printBtn.addEventListener("click", () => {
        window.print();
    });
}
