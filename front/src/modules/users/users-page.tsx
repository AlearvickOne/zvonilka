// app/page.tsx
"use client";

import { useState, useRef, useEffect } from "react";

export function P2PCallDemo() {
  const [myKey, setMyKey] = useState("user1");
  const [peerKey, setPeerKey] = useState("user2");
  const [logMessages, setLogMessages] = useState<string[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const log = (msg: string) => {
    console.log(msg);
    setLogMessages((prev) => [...prev, msg]);
  };

  const startLocalStream = async () => {
    if (!localStreamRef.current) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const audioEl = document.createElement("audio");
      audioEl.srcObject = stream;
      audioEl.autoplay = true;
      audioEl.muted = true; // слышим себя
      document.body.appendChild(audioEl);
    }
  };

  const createPeerConnection = (remoteKey: string) => {
    const pc = new RTCPeerConnection();

    // Локальные треки
    localStreamRef.current
      ?.getTracks()
      .forEach((track) => pc.addTrack(track, localStreamRef.current!));

    // Воспроизведение удаленного аудио
    pc.ontrack = (event) => {
      const audio = document.createElement("audio");
      audio.srcObject = event.streams[0];
      audio.autoplay = true;
      document.body.appendChild(audio);
    };

    // ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current) {
        wsRef.current!.send(
          JSON.stringify({
            action: "ice",
            to: remoteKey,
            candidate: event.candidate,
          }),
        );
      }
    };

    return pc;
  };

  const handleRegister = () => {
    wsRef.current = new WebSocket("wss://zvonilka-alearvick.amvera.io/ws");

    wsRef.current!.onopen = () => {
      log("WebSocket открыт");
      wsRef.current?.send(JSON.stringify({ action: "register", key: myKey }));
    };

    wsRef.current!.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      log("Получено: " + JSON.stringify(msg));

      switch (msg.action) {
        case "incoming_call":
          await startLocalStream();
          pcRef.current = createPeerConnection(msg.from);

          await pcRef.current!.setRemoteDescription({
            type: "offer",
            sdp: msg.signal.sdp,
          });
          const answer = await pcRef!.current!.createAnswer();
          await pcRef.current!.setLocalDescription(answer);

          wsRef.current!.send(
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
            pcRef
              .current!.addIceCandidate(new RTCIceCandidate(msg.candidate))
              .catch((e) => log("Ошибка ICE: " + e));
          }
          break;

        case "call_ended":
          log("Звонок завершен");
          pcRef.current?.close();
          pcRef.current = null;
          break;
      }
    };
  };

  const handleCall = async () => {
    await startLocalStream();
    pcRef.current = createPeerConnection(peerKey);

    const offer = await pcRef.current!.createOffer();
    await pcRef.current!.setLocalDescription(offer);

    wsRef.current?.send(
      JSON.stringify({
        action: "call",
        to: peerKey,
        signal: { sdp: offer.sdp },
      }),
    );
  };

  const handleHangup = () => {
    wsRef.current?.send(JSON.stringify({ action: "bye", to: peerKey }));
    pcRef.current?.close();
    pcRef.current = null;
    log("Звонок завершен");
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>P2P Call через WebSocket + WebRTC</h1>

      <div>
        <label>
          Ваш ключ:{" "}
          <input value={myKey} onChange={(e) => setMyKey(e.target.value)} />
        </label>
        <button onClick={handleRegister}>Зарегистрироваться</button>
      </div>

      <div style={{ marginTop: 10 }}>
        <label>
          Ключ собеседника:{" "}
          <input value={peerKey} onChange={(e) => setPeerKey(e.target.value)} />
        </label>
        <button onClick={handleCall}>Позвонить</button>
        <button onClick={handleHangup}>Завершить</button>
      </div>

      <h3>Лог:</h3>
      <pre>{logMessages.join("\n")}</pre>
    </div>
  );
}
