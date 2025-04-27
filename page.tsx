// src/app/Components/S/Quiz/Submit/page.tsx
"use client";

import React, { useState, useEffect, MouseEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface QuizDetail {
  _id: string;
  quizTitle: string;
  description?: string;
  totalMarks: number;
  deadline: string;
  key: string;     // ← Add this line!
  quizFile?: { fileName: string };
  mode: "offline" | "online";
  questionCount?: number;
  timeLimit?: number;
  shortNote?: string;
}


export default function SubmitQuiz() {
  const router = useRouter();
  const params = useSearchParams();
  const quizId = params.get("quizId");

  // ── Core state ────────────────────────────────────────────────────────────
  const [quiz, setQuiz]                     = useState<QuizDetail | null>(null);
  const [loading, setLoading]               = useState(true);

  // Offline submission fields
  const [submissionText, setSubmissionText] = useState("");
  const [submissionFile, setSubmissionFile] = useState<File | null>(null);

  // Online quiz state
  const [openedDescription, setOpenedDescription] = useState<string | null>(null);
  const [showModal, setShowModal]                 = useState(false);
  const [answers, setAnswers]                     = useState<string[]>([]);
  const [locked, setLocked]                       = useState<boolean[]>([]);
  const [timeLeft, setTimeLeft]                   = useState<number>(0);
  const [autoSubmitted, setAutoSubmitted]         = useState(false);

  // Attempt flags
  const [attempted, setAttempted]   = useState(false);
  const [offlineSaved, setOfflineSaved] = useState(false);

  // Grading result
  const [result, setResult] = useState<{
    details: { question: number; correctAnswer: string; studentAnswer: string; isCorrect: boolean }[];
    obtainedMarks: number;
    totalMarks: number;
  } | null>(null);

  // ── Encryption / Decryption ────────────────────────────────────────────────
  const encryptText = (text: string): string =>
    text.split("").map(char => {
      if (char >= "A" && char <= "Z") return String.fromCharCode(((char.charCodeAt(0) - 65 + 11) % 26) + 65);
      if (char >= "a" && char <= "z") return String.fromCharCode(((char.charCodeAt(0) - 97 + 11) % 26) + 97);
      if (char >= "0" && char <= "9") return String.fromCharCode(((char.charCodeAt(0) - 48 + 4) % 10) + 48);
      return char;
    }).join("");

  const decryptText = (text: string): string =>
    text.split("").map(char => {
      if (char >= "A" && char <= "Z") return String.fromCharCode(((char.charCodeAt(0) - 65 - 11 + 26) % 26) + 65);
      if (char >= "a" && char <= "z") return String.fromCharCode(((char.charCodeAt(0) - 97 - 11 + 26) % 26) + 97);
      if (char >= "0" && char <= "9") return String.fromCharCode(((char.charCodeAt(0) - 48 - 4 + 10) % 10) + 48);
      return char;
    }).join("");

  // ── Download quiz (.docx or encrypted .txt) ───────────────────────────────
  const handleDownload = async () => {
    if (!quiz) return;
    if (quiz.mode === "online" && quiz.description) {
      const encrypted = encryptText(quiz.description);
      const res = await fetch("/api/Down/Hash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quizId: quiz._id,
          fileName: `${quiz.quizTitle.replace(/\s+/g, "_")}_encrypted.txt`,
          encrypted,
        }),
      });
      if (!res.ok) return alert("Failed to download encrypted file");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${quiz.quizTitle.replace(/\s+/g, "_")}_encrypted.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } else {
      // offline: download .docx
      const res = await fetch(`/api/Down?quizId=${quiz._id}`);
      if (!res.ok) return alert("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = quiz.quizFile?.fileName || "quiz.docx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  };

  // ── Open encrypted quiz file and immediately prompt key ──────────────────
  const handleOpenQuiz = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const decrypted = decryptText(await file.text());
      setOpenedDescription(decrypted);
      setQuiz(prev => {
        if (!prev) return null;
        return { ...prev, description: decrypted }; // ✅ update only description, keep key and other fields safe
      });
      openOnlineModal(); // ✅ open after updating
    };
    input.click();
  };
  

  // ── Prompt for key, mark attempted, start timer ──────────────────────────
  const openOnlineModal = () => {
    const entered = prompt("Enter quiz key to start:");
    const enteredKey = prompt("Enter quiz key to start:")?.trim();
    const actualKey  = quiz?.key?.trim();
  
    console.log("Entered Key:", enteredKey);
    console.log("Quiz Key from DB:", actualKey);
  
    if (enteredKey && actualKey && enteredKey === actualKey) {
      console.log("✅ Keys matched!");
    
    
      setShowModal(true);
      if (quiz?.timeLimit) setTimeLeft(quiz.timeLimit * 60);
    } else {
      console.log("❌ Keys not matching!");
      alert("Incorrect key.");
    }
  };
  
  
  

  // ── Save current answers offline (encrypted) ─────────────────────────────
  const handleSaveOffline = async () => {
    if (!quiz) return alert("No quiz loaded");
    const rollNo = localStorage.getItem("rollNo")!;
    const studentName = localStorage.getItem("studentName")!;
    setLocked(answers.map(() => true));
    const payload = {
      quizId,
      rollNo,
      studentName,
      answers: answers.map((ans, i) => ({ question: i + 1, answer: ans || "" })),
    };
    const encrypted = encryptText(JSON.stringify(payload));
    const res = await fetch("/api/Down/Hash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quizId,
        fileName: `${quiz.quizTitle.replace(/\s+/g, "_")}_answers_offline.txt`,
        encrypted,
      }),
    });
    if (!res.ok) return alert("Failed to save offline answers");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${quiz.quizTitle.replace(/\s+/g, "_")}_answers_offline.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setOfflineSaved(true);
    alert("Answers saved offline. Upload when ready.");
     localStorage.setItem(`quizAttempted-${quizId}`, "true");
 setAttempted(true);
setShowModal(false);
  };
  const handleCancelAttempt = async () => {
    // 1. Save whatever answers are locked so far
    await handleSaveOffline();  
  
    // 2. Mark quiz as attempted
    localStorage.setItem(`quizAttempted-${quizId}`, "true");
    setAttempted(true);
  
    // 3. Close the modal
    setShowModal(false);
  };

  // ── Upload offline answers and grade immediately ─────────────────────────
  const handleUploadOfflineQuiz = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const decrypted = decryptText(await file.text());
      let payload;
      try {
        payload = JSON.parse(decrypted);
      } catch {
        return alert("Invalid offline answers file");
      }
      const res = await fetch("/api/Component/S/Quiz/Submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (res.ok && body.result) {
        setResult(body.result);
        setAttempted(true);
        alert("Offline answers uploaded and graded!");
      } else {
        alert("Upload failed: " + (body.error || "Unknown error"));
      }
    };
    input.click();
  };

  // ── Fetch quiz details + existing grade on mount ────────────────────────
  useEffect(() => {
    if (!quizId) return;
    const rno = localStorage.getItem("rollNo");
    fetch(`/api/Component/S/Quiz/Submit?quizId=${quizId}&rollNo=${rno}`)
      .then(r => r.json())
      .then((data: any) => {
        setQuiz(data.quiz);
        if (data.quiz.mode === "online" && data.quiz.questionCount) {
          setAnswers(Array(data.quiz.questionCount).fill(""));
          setLocked(Array(data.quiz.questionCount).fill(false));
        }
        if (data.submitted && data.result) {
          setResult(data.result);
          setAttempted(true);
          setLocked(Array(data.quiz.questionCount!).fill(true));
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [quizId]);

  // ── Enforce single attempt from localStorage ─────────────────────────────
  useEffect(() => {
    if (!quizId || answers.length === 0) return;
    if (localStorage.getItem(`quizAttempted-${quizId}`) === "true") {
      setAttempted(true);
      setLocked(answers.map(() => true));
    }
  }, [quizId, answers.length]);

  // ── Offline form submission (unchanged) ─────────────────────────────────
  const handleSubmit = async (e: MouseEvent) => {
    e.preventDefault();
    if (!quizId) return;
    const rno = localStorage.getItem("rollNo");
    const studentName = localStorage.getItem("studentName");
    if (!rno || !studentName) return alert("Student info missing");
    const fd = new FormData();
    fd.append("quizId", quizId);
    fd.append("rollNo", rno);
    fd.append("studentName", studentName);
    fd.append("submissionText", submissionText);
    if (submissionFile) fd.append("submissionFile", submissionFile);
    const res = await fetch("/api/Component/S/Quiz/Submit", {
      method: "POST",
      body: fd,
    });
    if (res.ok) {
      alert("Submitted successfully!");
      router.back();
      localStorage.setItem(`quizAttempted-${quizId}`, "true");
setAttempted(true);
    } else {
      alert("Error: " + (await res.text()));
    }
  };

  // ── Auto-submit on timeout ──────────────────────────────────────────────
  useEffect(() => {
    if (!showModal || timeLeft <= 0) return;
    const iv = setInterval(() => setTimeLeft(t => t - 1), 1000);
    return () => clearInterval(iv);
  }, [showModal, timeLeft]);

  useEffect(() => {
    if (!showModal || timeLeft > 0) return;
    setLocked(answers.map(() => true));
    (async () => {
      const rno = localStorage.getItem("rollNo")!;
      const studentName = localStorage.getItem("studentName")!;
      const res = await fetch("/api/Component/S/Quiz/Submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quizId,
          rollNo: rno,
          studentName,
          answers: answers.map((ans, i) => ({ question: i + 1, answer: ans })),
        }),
      });
      const body = await res.json();
      if (res.ok && body.result) {
        setResult(body.result);
        setAutoSubmitted(true);
      }
    })();
  }, [timeLeft, showModal, answers, quizId]);

  // ── Answer change & manual submit ───────────────────────────────────────
  const handleAnswerChange = (i: number, v: string) => {
    if (locked[i] || attempted) return;
    const a = [...answers];
    a[i] = v;
    setAnswers(a);
  };
  const lockAnswer = (i: number) => {
    if (!answers[i] || attempted) return;
    const l = [...locked];
    l[i] = true;
    setLocked(l);
  };
  const handleOnlineSubmit = async () => {
    if (!quizId) return;
    const rno = localStorage.getItem("rollNo")!;
    const studentName = localStorage.getItem("studentName")!;
    setLocked(answers.map((ans, i) => locked[i] || ans !== ""));
    const res = await fetch("/api/Component/S/Quiz/Submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quizId,
        rollNo: rno,
        studentName,
        answers: answers.map((ans, i) => ({ question: i + 1, answer: ans || "" })),
      }),
    });
    const body = await res.json();
    if (res.ok && body.result) {
      setResult(body.result);
      setAutoSubmitted(true);
      setAttempted(true);
    } else {
      alert("Submission failed: " + (body.error || "Unknown error"));
    }
  };

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-[#f0fdfa] to-[#e0f8f5]">
      <div className="max-w-3xl mx-auto bg-white p-6 rounded-xl shadow-lg">

        {/* Header */}
        <h2 className="text-2xl font-bold text-[#0F6466] mb-4">
          Submit: {quiz?.quizTitle}
        </h2>
        <p><strong>Marks:</strong> {quiz?.totalMarks}</p>
        <p><strong>Deadline:</strong>{" "}
           {quiz && new Date(quiz.deadline).toLocaleDateString()}
        </p>

        {/* OFFLINE MODE */}
        {quiz?.mode === "offline" && (
          <>
            {quiz.description && (
              <div className="my-4 bg-gray-50 p-4 rounded whitespace-pre-wrap font-mono">
                {quiz.description}
              </div>
            )}
            {quiz.quizFile?.fileName && (
              <button
                onClick={handleDownload}
                className="mt-4 px-4 py-2 bg-[#0F6466] text-white rounded-lg"
              >
                Download Quiz (.docx)
              </button>
            )}
            <form onSubmit={handleSubmit as any} className="mt-6 space-y-4">
              {/* offline form fields */}
            </form>
          </>
        )}

        {/* ONLINE MODE (before attempt/modal) */}
        {quiz?.mode === "online" && !showModal && !result && (
          <div className="mt-6 space-y-4">
            {attempted ? (
              <div className="space-y-4">
                <p className="text-red-600">You have already attempted this quiz.</p>
                <button
                  onClick={handleUploadOfflineQuiz}
                  className="w-full py-3 bg-blue-200 text-blue-800 rounded-lg"
                >
                  Upload Offline Quiz
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {quiz.timeLimit != null && (
                  <p className="text-lg">
                    ⏱ <strong>Time Limit:</strong> {quiz.timeLimit} minute
                    {quiz.timeLimit > 1 ? "s" : ""}
                  </p>
                )}
                {quiz.shortNote && (
                  <p className="italic text-gray-700">📝 {quiz.shortNote}</p>
                )}

                <button
                  onClick={openOnlineModal}
                  className="w-full py-3 bg-gradient-to-r from-[#4C6EF5] to-[#748FFC] text-white rounded-lg"
                >
                  Attempt Quiz
                </button>
                <button
                  onClick={handleDownload}
                  className="w-full py-3 bg-gray-200 text-gray-800 rounded-lg"
                >
                  Download Quiz (.txt)
                </button>
                <button
                  onClick={handleOpenQuiz}
                  className="w-full py-3 border border-dashed border-gray-400 rounded-lg"
                >
                  Open Quiz
                </button>
                <button
                  onClick={handleUploadOfflineQuiz}
                  className="w-full py-3 bg-blue-200 text-blue-800 rounded-lg"
                >
                  Upload Offline Quiz
                </button>
              </div>
            )}
          </div>
        )}

        {/* RESULT SUMMARY */}
        {result && (
          <div className="mt-6 space-y-4">
            <h3 className="text-xl font-semibold">Your Results</h3>
            {result.details.map((d) => (
              <p key={d.question}>
                Q{d.question}: Your answer “{d.studentAnswer}” —{" "}
                {d.isCorrect ? (
                  <span className="text-green-600">Correct</span>
                ) : (
                  <span className="text-red-600">
                    Wrong (correct: {d.correctAnswer})
                  </span>
                )}
              </p>
            ))}
            <p className="mt-2 font-bold">
              Score: {result.obtainedMarks} / {result.totalMarks}
            </p>
            <button
              onClick={() => router.back()}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg"
            >
              Back
            </button>
          </div>
        )}

        {/* ONLINE MODE (modal) */}
        {showModal && quiz?.mode === "online" && !autoSubmitted && !result && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg w-full max-w-4xl max-h-full overflow-auto p-6 relative">
              {/* Modal header */}
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-bold">{quiz.quizTitle}</h3>
                <span className="text-4xl font-bold text-red-600 font-mono">
                  {String(Math.floor(timeLeft / 60)).padStart(2, "0")}:
                  {String(timeLeft % 60).padStart(2, "0")}
                </span>
              </div>

              {/* Quiz description */}
              <div className="mb-4 whitespace-pre-wrap font-mono bg-gray-100 p-4 rounded max-h-40 overflow-auto">
                {quiz.description}
              </div>

              {/* Questions */}
              <div className="space-y-6">
                {Array.from({ length: quiz.questionCount! }, (_, i) => (
                  <div key={i} className="p-4 border rounded">
                    <p className="mb-2 font-semibold">Question {i + 1}</p>
                    <div className="flex space-x-4">
                      {["A","B","C","D","E"].map((opt) => (
                        <label key={opt} className="inline-flex items-center space-x-1">
                          <input
                            type="radio"
                            name={`q${i}`}
                            value={opt}
                            checked={answers[i] === opt}
                            disabled={locked[i] || attempted}
                            onChange={() => handleAnswerChange(i, opt)}
                          />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                    <button
                      onClick={() => lockAnswer(i)}
                      disabled={locked[i] || attempted}
                      className={`mt-2 px-3 py-1 rounded ${
                        locked[i] || attempted
                          ? "bg-gray-200 text-gray-800"
                          : "bg-blue-200 text-blue-800"
                      }`}
                    >
                      {locked[i] || attempted ? "Locked" : "Lock Answer"}
                    </button>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="mt-6 flex justify-end space-x-4">
                <button
                  onClick={handleCancelAttempt}
                  className="px-4 py-2 bg-gray-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveOffline}
                  disabled={offlineSaved || attempted}
                  className={`px-4 py-2 rounded-lg ${
                    offlineSaved || attempted
                      ? "bg-gray-400 text-gray-800 cursor-not-allowed"
                      : "bg-yellow-500 text-white"
                  }`}
                >
                  {offlineSaved ? "Saved Offline" : "Save Offline"}
                </button>
                <button
                  onClick={handleOnlineSubmit}
                  disabled={attempted}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg"
                >
                  Submit All
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}


