const video = document.getElementById("video");
const status = document.getElementById("status");

// Load models based on your folder structure
Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri("models"),
  faceapi.nets.faceLandmark68Net.loadFromUri("models"),
  faceapi.nets.faceRecognitionNet.loadFromUri("models"),
]).then(initSystem);

async function initSystem() {
  status.innerText = "Models Loaded. Starting Camera...";
  startVideo();

  if (document.getElementById("studentList")) {
    renderStudentList();
  }

  if (document.getElementById("attendanceLog")) {
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
  const name = document.getElementById("studentName").value;
  const roll = document.getElementById("rollNumber").value;

  if (!name || !roll) return alert("Enter Name and Roll Number");

  status.innerText = "Capturing Face... Please keep still";

  const detection = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (detection) {
    const studentData = {
      name: name,
      roll: roll,
      descriptor: Array.from(detection.descriptor), // Must convert to array for JSON
    };

    let students = JSON.parse(localStorage.getItem("students") || "[]");
    students.push(studentData);
    localStorage.setItem("students", JSON.stringify(students));

    status.innerText = `Registered ${name} successfully!`;
    renderStudentList();
  } else {
    alert("Face not detected. Try again.");
  }
}

function renderStudentList() {
  const list = document.getElementById("studentList");
  const students = JSON.parse(localStorage.getItem("students") || "[]");
  list.innerHTML = students
    .map((s) => `<tr><td>${s.name}</td><td>${s.roll}</td></tr>`)
    .join("");
}
async function startAttendanceScanner() {
  const students = JSON.parse(localStorage.getItem("students") || "[]");
  if (students.length === 0) {
    status.innerText = "No students registered. Please register first.";
    return;
  }

  // Convert stored data back into FaceDescriptors
  const labeledDescriptors = students.map((s) => {
    return new faceapi.LabeledFaceDescriptors(s.name, [
      new Float32Array(s.descriptor),
    ]);
  });

  const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);

  // FIXED: Wait for video to start playing before creating canvas
  video.addEventListener("play", () => {
    status.innerText = "Scanner Active";

    // Create canvas and match it to video dimensions
    const canvas = faceapi.createCanvasFromMedia(video);
    document.getElementById("video-container").append(canvas);

    const displaySize = { width: video.width, height: video.height };
    faceapi.matchDimensions(canvas, displaySize);

    setInterval(async () => {
      const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptors();

      const resizedDetections = faceapi.resizeResults(detections, displaySize);

      // Clear previous drawings
      canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);

      resizedDetections.forEach((detection) => {
        const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
        const box = detection.detection.box;

        // Draw detection box
        const drawBox = new faceapi.draw.DrawBox(box, {
          label: bestMatch.toString(),
        });
        drawBox.draw(canvas);

        // If match found, mark attendance
        if (bestMatch.label !== "unknown") {
          markAttendance(bestMatch.label);
        }
      });
    }, 1000); // Scans every 1 second
  });

  // Fallback: If video is already playing but event hasn't fired
  if (!video.paused) {
    video.dispatchEvent(new Event("play"));
  }
}

function markAttendance(name) {
  let attendance = JSON.parse(localStorage.getItem("attendance_log") || "[]");
  const today = new Date().toLocaleDateString();
  const time = new Date().toLocaleTimeString();

  // Prevent double attendance for same person on the same day
  if (
    !attendance.find((entry) => entry.name === name && entry.date === today)
  ) {
    attendance.push({ name, date: today, time });
    localStorage.setItem("attendance_log", JSON.stringify(attendance));
    renderAttendanceLog();
  }
}

function renderAttendanceLog() {
  const logTable = document.getElementById("attendanceLog");
  const attendance = JSON.parse(localStorage.getItem("attendance_log") || "[]");
  logTable.innerHTML = attendance
    .map(
      (a) => `
        <tr>
            <td>${a.name}</td>
            <td>${a.date}</td>
            <td>${a.time}</td>
            <td style="color:green">Present</td>
        </tr>
    `
    )
    .join("");
}
