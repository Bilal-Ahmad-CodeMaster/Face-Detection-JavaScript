const video = document.getElementById("video");
const status = document.getElementById("status");

// Handle Active Tab based on URL
function setActiveTab() {
  const currentPath = window.location.pathname;
  const navLinks = document.querySelectorAll("nav a");
  navLinks.forEach((link) => {
    const linkPath = link.getAttribute("href");
    if (
      currentPath.endsWith(linkPath) ||
      (currentPath.endsWith("/") && linkPath === "index.html")
    ) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });
}

// Load models
Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri("models"),
  faceapi.nets.faceLandmark68Net.loadFromUri("models"),
  faceapi.nets.faceRecognitionNet.loadFromUri("models"),
]).then(initSystem);

async function initSystem() {
  setActiveTab();
  status.innerText = "AI Ready. Starting Camera...";
  if (video) startVideo();
  if (document.getElementById("studentList")) renderStudentList();
  if (document.getElementById("attendanceLog")) {
    renderAttendanceLog();
    startAttendanceScanner();
  }
}

function startVideo() {
  navigator.mediaDevices
    .getUserMedia({ video: {} })
    .then((stream) => {
      video.srcObject = stream;
    })
    .catch((err) => (status.innerText = "Error: Camera Access Denied"));
}

// --- REGISTRATION LOGIC ---
async function registerStudent() {
  if (video.videoWidth === 0) return alert("Camera not ready.");

  const nameInput = document.getElementById("studentName");
  const rollInput = document.getElementById("rollNumber");
  const name = nameInput.value.trim();
  const roll = rollInput.value.trim();

  if (!name || !roll) return alert("Enter Name and Roll Number.");

  let students = JSON.parse(localStorage.getItem("students") || "[]");

  // 1. Check Unique ID
  if (students.some((s) => s.roll === roll)) {
    status.innerText = "Error: Roll Number already exists.";
    status.style.color = "#ef4444";
    return;
  }

  status.innerText = "Scanning face for uniqueness...";

  const detection = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) return alert("Face not detected. Look at the camera.");

  // 2. Check Unique Face
  if (students.length > 0) {
    const labeledDescriptors = students.map(
      (s) =>
        new faceapi.LabeledFaceDescriptors(s.name, [
          new Float32Array(s.descriptor),
        ])
    );
    const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
    const bestMatch = faceMatcher.findBestMatch(detection.descriptor);

    if (bestMatch.label !== "unknown") {
      status.innerText = `Error: User already registered as ${bestMatch.label}`;
      status.style.color = "#ef4444";
      return;
    }
  }

  // Save new user
  students.push({ name, roll, descriptor: Array.from(detection.descriptor) });
  localStorage.setItem("students", JSON.stringify(students));

  status.innerText = `Registered ${name} successfully!`;
  status.style.color = "#22c55e";
  nameInput.value = "";
  rollInput.value = "";
  renderStudentList();
}

function renderStudentList() {
  const list = document.getElementById("studentList");
  if (!list) return;
  const students = JSON.parse(localStorage.getItem("students") || "[]");
  list.innerHTML = students
    .map(
      (s) => `
    <tr>
      <td>${s.name}</td>
      <td>${s.roll}</td>
      <td style="text-align:right">
        <button onclick="deleteStudent('${s.roll}')" class="btn-small">Delete</button>
      </td>
    </tr>`
    )
    .join("");
}

function deleteStudent(roll) {
  if (confirm("Remove this user?")) {
    let students = JSON.parse(localStorage.getItem("students") || "[]");
    localStorage.setItem(
      "students",
      JSON.stringify(students.filter((s) => s.roll !== roll))
    );
    renderStudentList();
  }
}

// --- ATTENDANCE LOGIC ---
async function startAttendanceScanner() {
  const students = JSON.parse(localStorage.getItem("students") || "[]");
  if (students.length === 0)
    return (status.innerText = "No users in database.");

  const labeledDescriptors = students.map(
    (s) =>
      new faceapi.LabeledFaceDescriptors(s.name, [
        new Float32Array(s.descriptor),
      ])
  );
  const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);

  video.addEventListener("play", () => {
    const canvas = faceapi.createCanvasFromMedia(video);
    document.getElementById("video-container").append(canvas);
    const displaySize = {
      width: video.offsetWidth,
      height: video.offsetHeight,
    };
    faceapi.matchDimensions(canvas, displaySize);

    setInterval(async () => {
      if (video.videoWidth === 0) return;
      const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptors();
      const resized = faceapi.resizeResults(detections, displaySize);
      canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);

      resized.forEach((d) => {
        const match = faceMatcher.findBestMatch(d.descriptor);
        new faceapi.draw.DrawBox(d.detection.box, {
          label: match.toString(),
        }).draw(canvas);
        if (match.label !== "unknown") markAttendance(match.label);
      });
    }, 1000);
  });
}

function markAttendance(name) {
  let log = JSON.parse(localStorage.getItem("attendance_log") || "[]");
  const today = new Date().toLocaleDateString();
  if (!log.find((e) => e.name === name && e.date === today)) {
    log.push({ name, date: today, time: new Date().toLocaleTimeString() });
    localStorage.setItem("attendance_log", JSON.stringify(log));
    renderAttendanceLog();
  }
}

function renderAttendanceLog() {
  const logTable = document.getElementById("attendanceLog");
  if (!logTable) return;
  const log = JSON.parse(localStorage.getItem("attendance_log") || "[]");
  logTable.innerHTML = [...log]
    .reverse()
    .map(
      (a) => `
    <tr>
      <td>${a.name}</td>
      <td>${a.date}</td>
      <td>${a.time}</td>
      <td style="color:#22c55e; font-weight:bold">Present</td>
    </tr>`
    )
    .join("");
}
