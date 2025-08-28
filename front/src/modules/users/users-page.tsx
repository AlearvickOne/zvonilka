"use client";

import React, { useEffect, useRef, useState } from "react";

export const VideoCallApp: React.FC = () => {
  const [myKey, setMyKey] = useState("");
  const [peerKey, setPeerKey] = useState("");
  const [logMessages, setLogMessages] = useState<string[]>([]);

  const [micEnabled, setMicEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [hasMic, setHasMic] = useState(false);
  const [hasCamera, setHasCamera] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  const log = (msg: string) => {
    console.log(msg);
    setLogMessages((prev) => [...prev, msg]);
  };
  /**/
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      setHasMic(devices.some((d) => d.kind === "audioinput"));
      setHasCamera(devices.some((d) => d.kind === "videoinput"));
    });

    return () => {
      pcRef.current?.close();
      socketRef.current?.close();
    };
  }, []);

  const startLocalStream = async () => {
    if (!micEnabled) {
      log("Микрофон не выбран — поток не создается");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: micEnabled,
      });

      localStreamRef.current = stream;

      // создаём скрытый аудио элемент для прослушивания себя без эха
      const audio = document.createElement("audio");
      audio.srcObject = stream;
      audio.autoplay = true;
      audio.muted = true;
      document.body.appendChild(audio);

      // включаем/выключаем треки микрофона по галочке
      stream.getAudioTracks().forEach((track) => (track.enabled = micEnabled));

      log("Локальный поток микрофона запущен");
    } catch (err) {
      log("Ошибка при получении аудио: " + err);
    }
  };

  const toggleMic = () => {
    if (!localStreamRef.current) return;
    localStreamRef
      .current!.getAudioTracks()
      .forEach((track) => (track.enabled = !track.enabled));
    setMicEnabled((prev) => !prev);
  };

  const toggleVideo = () => {
    if (!localStreamRef.current) return;
    localStreamRef
      .current!.getVideoTracks()
      .forEach((track) => (track.enabled = !track.enabled));
    setVideoEnabled((prev) => !prev);
  };

  const createPeerConnection = (peerKey: string) => {
    const pc = new RTCPeerConnection();

    localStreamRef.current
      ?.getTracks()
      .forEach((track) => pc.addTrack(track, localStreamRef.current!));

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current!.srcObject = event.streams[0];
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.send(
          JSON.stringify({
            action: "ice",
            to: peerKey,
            candidate: event.candidate,
          }),
        );
      }
    };

    return pc;
  };

  const register = () => {
    socketRef.current = new WebSocket("wss://zvonilka-alearvick.amvera.io/ws");

    socketRef.current!.onopen = () => {
      log("WebSocket connected");
      socketRef.current?.send(
        JSON.stringify({ action: "register", key: myKey }),
      );
    };

    socketRef.current!.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      log("Received: " + JSON.stringify(msg));

      switch (msg.action) {
        case "incoming_call":
          await startLocalStream();
          pcRef.current = createPeerConnection(msg.from);
          await pcRef.current!.setRemoteDescription({
            type: "offer",
            sdp: msg.signal.sdp,
          });
          const answer = await pcRef.current!.createAnswer();
          await pcRef.current!.setLocalDescription(answer);

          socketRef.current?.send(
            JSON.stringify({
              action: "answer",
              to: msg.from,
              signal: { sdp: answer.sdp },
            }),
          );
          break;

        case "call_answer":
          await pcRef.current!.setRemoteDescription({
            type: "answer",
            sdp: msg.signal.sdp,
          });
          break;

        case "ice":
          if (pcRef.current) {
            await pcRef.current!.addIceCandidate(
              new RTCIceCandidate(msg.candidate),
            );
          }
          break;

        case "call_ended":
          pcRef.current?.close();
          pcRef.current = null;
          // if (remoteVideoRef.current) remoteVideoRef.current!.srcObject = null;
          break;
      }
    };
  };

  const callPeer = async () => {
    await startLocalStream();
    pcRef.current = createPeerConnection(peerKey);

    const offer = await pcRef.current!.createOffer();
    await pcRef.current!.setLocalDescription(offer);

    socketRef.current?.send(
      JSON.stringify({
        action: "call",
        to: peerKey,
        signal: { sdp: offer.sdp },
      }),
    );
  };

  const hangup = () => {
    socketRef.current?.send(JSON.stringify({ action: "bye", to: peerKey }));
    pcRef.current?.close();
    pcRef.current = null;
    // if (remoteVideoRef.current) remoteVideoRef.current!.srcObject = null;
  };

  return (
    <div className="p-6 bg-gray-900 min-h-screen text-white flex flex-col items-center">
      <h1 className="text-3xl font-bold mb-6">WebRTC Video Call + WS</h1>

      <div className="flex gap-4 mb-4">
        <input
          value={myKey}
          onChange={(e) => setMyKey(e.target.value)}
          placeholder="Ваш ключ"
          className="px-3 py-2 rounded-md w-48 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-700 text-white placeholder-gray-400"
        />
        <button
          onClick={register}
          className="px-4 py-2 bg-blue-600 rounded-md hover:bg-blue-700 transition"
        >
          Register
        </button>
      </div>

      <div className="flex gap-4 mb-4">
        <input
          value={peerKey}
          onChange={(e) => setPeerKey(e.target.value)}
          placeholder="Ключ собеседника"
          className="px-3 py-2 rounded-md w-48 focus:outline-none focus:ring-2 focus:ring-green-500 bg-gray-700 text-white placeholder-gray-400"
        />
        <button
          onClick={callPeer}
          className="px-4 py-2 bg-green-600 rounded-md hover:bg-green-700 transition"
        >
          Call
        </button>
        <button
          onClick={hangup}
          className="px-4 py-2 bg-red-600 rounded-md hover:bg-red-700 transition"
        >
          Hangup
        </button>
      </div>

      <div className="flex gap-4 mb-6">
        {hasMic && (
          <button
            onClick={toggleMic}
            className="px-4 py-2 bg-gray-700 rounded-md hover:bg-gray-600 transition"
          >
            {micEnabled ? "Mute Mic" : "Unmute Mic"}
          </button>
        )}
        {hasCamera && (
          <button
            onClick={toggleVideo}
            className="px-4 py-2 bg-gray-700 rounded-md hover:bg-gray-600 transition"
          >
            {videoEnabled ? "Stop Video" : "Start Video"}
          </button>
        )}
      </div>

      <div className="relative w-full flex justify-center items-start gap-4">
        <video
          ref={remoteVideoRef}
          autoPlay
          className="w-4/5 h-[60vh] bg-black rounded-md"
        />
        <video
          ref={localVideoRef}
          autoPlay
          muted
          className="absolute top-4 right-4 w-48 h-36 border-2 border-white rounded-md"
        />
      </div>

      <pre className="mt-6 p-4 w-4/5 h-40 bg-gray-800 rounded-md overflow-y-auto text-sm">
        {logMessages.join("\n")}
      </pre>
    </div>
  );
};
