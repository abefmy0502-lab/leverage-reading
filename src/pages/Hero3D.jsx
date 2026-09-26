// 🌱 LP ヒーローの 3D（three.js・LP だけで遅延読み込み）
//
// 見せたいこと（1 か所だけの意味のある動き）: 相談の答えの裏には、あなたが残したメモがある。
// 相談の答えを映した iPhone の後ろ（スマホでは手前の角）から、根拠になった本のメモが
// すっと出てきて止まる。あとはマウスの位置（タッチ端末はゆっくりした揺れ）で少し傾くだけ。
//
// 表示速度: 最初は親が <img>（相談の答えの写真）を出しておき、3D は読み込みとテクスチャの
// 準備ができてから重ねる（onReady）。写真と 3D の画面の大きさを合わせてあるので入れ替わりで跳ねない。
// 動きを減らす設定では、登場も揺れも止めて 1 枚の静止画として描く。WebGL が無ければ何もしない
// （写真のまま）。画面外・タブ非表示の間は描画を止める。
//
// 色はアプリのトークン（--surface / --text / --accent …）を実行時に読み、明暗の切替えで作り直す。
// メモの文面はお試しモードのサンプルのメモ（相談の答えの根拠になっている 3 冊）から。

import { useEffect, useRef } from 'react';
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, Shape, ExtrudeGeometry, ShapeGeometry,
  PlaneGeometry, BoxGeometry, MeshPhysicalMaterial, MeshBasicMaterial, CanvasTexture,
  SRGBColorSpace, PMREMGenerator, Color,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const MEMOS = [
  { title: 'イシューからはじめよ', page: 'P.25', text: '答えを出す前に、本当に答えるべき問いかを確かめる。' },
  { title: '1兆ドルコーチ', page: 'P.95', text: 'チームの勝利が最優先。個人の手柄より、チームが勝つ判断をする。' },
  { title: '数値化の鬼', page: 'P.15', text: '「頑張ります」は計測できない。行動を「数」で決める。' },
];

// 寸法（ワールド単位）。画面写真は 780×1688。
const SCREEN_W = 0.72;
const SCREEN_H = SCREEN_W * (1688 / 780);
const BEZEL = 0.024;
const BODY_W = SCREEN_W + BEZEL * 2 + 0.03;
const BODY_H = SCREEN_H + BEZEL * 2 + 0.03;
const DEPTH = 0.05;
const BEVEL = 0.014;
const CARD_W = 0.6;
const FOV = 26;

const easeOut = (t) => 1 - (1 - t) ** 3;
const cssVar = (name, fallback) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

function roundedRect(w, h, r) {
  const s = new Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function ctxRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 1 文字ずつ測って折り返す（和文用）。最大行数を超えたら末尾を「…」。
function wrapLines(ctx, text, maxW, maxLines) {
  const lines = [];
  let line = '';
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW) {
      lines.push(line);
      line = ch;
      if (lines.length === maxLines) break;
    } else {
      line += ch;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && lines.join('').length < text.length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, -1)}…`;
  }
  return lines;
}

const FONT = '-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';

// メモのカード（影つき・角丸・透過）。textInset は左側が本体に隠れるカード用の余白（割合）。
function makeCardTexture(memo, textInset = 0) {
  const PAD = 44;
  const W = 640;
  const H = 272;
  const c = document.createElement('canvas');
  c.width = W + PAD * 2;
  c.height = H + PAD * 2;
  const ctx = c.getContext('2d');
  const surface = cssVar('--surface', '#fffefb');
  const text = cssVar('--text', '#2b2825');
  const text2 = cssVar('--text-2', '#5f5a53');
  const accent = cssVar('--accent', '#8a4b2a');
  const fill = cssVar('--fill', '#efece6');
  const sep = cssVar('--separator', '#dcd7ce');
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.22)';
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 12;
  ctxRoundRect(ctx, PAD, PAD, W, H, 28);
  ctx.fillStyle = surface;
  ctx.fill();
  ctx.restore();
  ctxRoundRect(ctx, PAD + 1, PAD + 1, W - 2, H - 2, 27);
  ctx.strokeStyle = sep;
  ctx.lineWidth = 2;
  ctx.stroke();

  const left = PAD + 36 + W * textInset;
  const innerW = W - 72 - W * textInset;
  ctx.textBaseline = 'top';
  ctx.font = `700 30px ${FONT}`;
  ctx.fillStyle = accent;
  const title = wrapLines(ctx, memo.title, innerW - 110, 1)[0];
  ctx.fillText(title, left, PAD + 34);
  const tw = ctx.measureText(title).width;
  ctx.font = `600 26px ${FONT}`;
  const pw = ctx.measureText(memo.page).width + 28;
  ctxRoundRect(ctx, left + tw + 16, PAD + 30, pw, 40, 20);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.fillStyle = text2;
  ctx.fillText(memo.page, left + tw + 30, PAD + 38);
  ctx.font = `400 32px ${FONT}`;
  ctx.fillStyle = text;
  wrapLines(ctx, memo.text, innerW, 3).forEach((l, i) => ctx.fillText(l, left, PAD + 98 + i * 50));

  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, aspect: c.height / c.width, scale: c.width / W };
}

// iPhone の画面（相談の答えの写真を角丸で切り抜き、ダイナミックアイランドを描く）。
function makeScreenTexture(img) {
  const c = document.createElement('canvas');
  c.width = 780;
  c.height = 1688;
  const ctx = c.getContext('2d');
  ctxRoundRect(ctx, 0, 0, c.width, c.height, 104);
  ctx.save();
  ctx.clip();
  ctx.drawImage(img, 0, 0, c.width, c.height);
  ctx.restore();
  ctxRoundRect(ctx, 390 - 124, 22, 248, 72, 36);
  ctx.fillStyle = '#050505';
  ctx.fill();
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// レイアウト: 本体の右に余白がある画面はカードを右後ろへ扇状に、無い画面は本体の手前の上下の角に 2 枚。
// availRight = 本体の中心から画面の右端（16px 手前）までのワールド単位。カードがはみ出さないよう x を寄せる。
function layoutFor(narrow, availRight = Infinity) {
  if (narrow) {
    return [
      // スマホは 1 枚を大きく（文字が 12px 以上になる幅）。本体の上端（見出しの辺り）に重ねる。
      { memo: 0, x: 0, y: SCREEN_H / 2 - 0.1, z: 0.16, ry: 0.1, rz: 0.025, w: 0.76, inset: 0 },
    ];
  }
  const fit = (l) => ({ ...l, x: Math.min(l.x, availRight - l.w * 0.56) });
  return [
    { memo: 0, x: 0.6, y: 0.5, z: -0.12, ry: -0.28, rz: 0.02, w: CARD_W, inset: 0.2 },
    { memo: 1, x: 0.68, y: -0.02, z: -0.22, ry: -0.3, rz: -0.01, w: CARD_W, inset: 0.2 },
    { memo: 2, x: 0.58, y: -0.54, z: -0.1, ry: -0.26, rz: 0.02, w: CARD_W, inset: 0.2 },
  ].map(fit);
}

export default function Hero3D({ stageRef, imgRef, onReady, onLost }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return undefined;

    let renderer;
    try {
      renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      return undefined; // WebGL が無い → 写真のまま
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
    const scene = new Scene();
    const pmrem = new PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    const camera = new PerspectiveCamera(FOV, 1, 0.1, 50);

    const disposables = [envTex, pmrem];
    const track = (o) => { disposables.push(o); return o; };

    // ---- 本体 ----
    const phone = new Group();
    scene.add(phone);
    const metal = track(new MeshPhysicalMaterial({ metalness: 1, roughness: 0.32, envMapIntensity: 1.1 }));
    const bodyGeo = track(new ExtrudeGeometry(roundedRect(BODY_W - BEVEL * 2, BODY_H - BEVEL * 2, 0.13), {
      depth: DEPTH, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 5, curveSegments: 28,
    }));
    bodyGeo.translate(0, 0, -DEPTH / 2);
    phone.add(new Mesh(bodyGeo, metal));
    const front = DEPTH / 2 + BEVEL;

    const glass = track(new MeshPhysicalMaterial({ color: 0x07070a, metalness: 0, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 }));
    const glassGeo = track(new ShapeGeometry(roundedRect(SCREEN_W + BEZEL * 2, SCREEN_H + BEZEL * 2, 0.122), 28));
    const glassMesh = new Mesh(glassGeo, glass);
    glassMesh.position.z = front + 0.0008;
    phone.add(glassMesh);

    const screenMat = track(new MeshBasicMaterial({ transparent: true, toneMapped: false }));
    const screenGeo = track(new PlaneGeometry(SCREEN_W, SCREEN_H));
    const screen = new Mesh(screenGeo, screenMat);
    screen.position.z = front + 0.0016;
    phone.add(screen);

    // ガラスの映り込み（ごく薄く）
    const sheenMat = track(new MeshPhysicalMaterial({ transparent: true, opacity: 0.07, metalness: 0, roughness: 0, envMapIntensity: 1.6 }));
    const sheen = new Mesh(glassGeo, sheenMat);
    sheen.position.z = front + 0.0024;
    phone.add(sheen);

    // 側面のボタン
    const btnGeo = track(new BoxGeometry(0.012, 1, 0.026));
    [
      { x: -1, y: 0.56, h: 0.05 }, { x: -1, y: 0.42, h: 0.1 }, { x: -1, y: 0.28, h: 0.1 }, { x: 1, y: 0.36, h: 0.15 },
    ].forEach(({ x, y, h }) => {
      const b = new Mesh(btnGeo, metal);
      b.scale.y = h;
      b.position.set(x * (BODY_W / 2 + 0.003), y, 0);
      phone.add(b);
    });

    // ---- メモのカード ----
    const cards = [];
    let cardGroup = new Group();
    scene.add(cardGroup);

    let narrow = false;
    let availRight = Infinity;
    let ppu = 1; // 1 ワールド単位あたりの px（写真の画面幅に合わせる）
    const size = { w: 1, h: 1 };

    const buildCards = () => {
      cards.forEach(({ mesh }) => { mesh.material.map?.dispose(); mesh.material.dispose(); mesh.geometry.dispose(); });
      cards.length = 0;
      scene.remove(cardGroup);
      cardGroup = new Group();
      scene.add(cardGroup);
      layoutFor(narrow, availRight).forEach((l, i) => {
        const { tex, aspect, scale } = makeCardTexture(MEMOS[l.memo], l.inset);
        const w = l.w * scale;
        const mesh = new Mesh(new PlaneGeometry(w, w * aspect), new MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
        mesh.renderOrder = l.z > 0 ? 3 : 0;
        cardGroup.add(mesh);
        cards.push({ mesh, l, delay: 0.25 + i * 0.16 });
      });
    };

    const phoneColor = () => new Color(darkMq.matches ? 0x5a544e : 0xcfc8be);

    const applyTheme = async () => {
      metal.color = phoneColor();
      metal.needsUpdate = true;
      const scheme = darkMq.matches ? 'dark' : 'light';
      const img = await loadImage(`/lp/answer-${scheme}-780.webp`);
      screenMat.map?.dispose();
      screenMat.map = makeScreenTexture(img);
      screenMat.needsUpdate = true;
      buildCards();
    };

    // ---- 大きさ: 3D の画面幅＝写真の画面幅 ----
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const imgRect = imgRef.current?.getBoundingClientRect();
      if (!rect.width || !rect.height || !imgRect?.width) return;
      size.w = rect.width;
      size.h = rect.height;
      renderer.setSize(rect.width, rect.height, false);
      const wasNarrow = narrow;
      const wasAvail = availRight;
      ppu = imgRect.width / SCREEN_W;
      availRight = (window.innerWidth - 16 - (imgRect.left + imgRect.width / 2)) / ppu;
      // 右後ろのカードが半分以上見えるだけの余白が無ければ、手前の角に置く
      narrow = availRight < 0.84;
      const visH = rect.height / ppu;
      camera.aspect = rect.width / rect.height;
      camera.position.z = visH / 2 / Math.tan((FOV / 2) * Math.PI / 180);
      // 写真の中心と 3D の本体の中心をそろえる（キャンバスは写真より広い）
      const dx = (imgRect.left + imgRect.width / 2) - (rect.left + rect.width / 2);
      const dy = (imgRect.top + imgRect.height / 2) - (rect.top + rect.height / 2);
      camera.position.x = -dx / ppu;
      camera.position.y = dy / ppu;
      camera.updateProjectionMatrix();
      if ((wasNarrow !== narrow || Math.abs(wasAvail - availRight) > 0.02) && cards.length) buildCards();
    };

    // ---- 動き ----
    const pointer = { x: 0, y: 0, active: false };
    const onPointer = (e) => {
      if (e.pointerType === 'touch') return;
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
      pointer.active = true;
    };
    window.addEventListener('pointermove', onPointer, { passive: true });

    let start = 0;
    let raf = 0;
    let running = false;
    let visible = true;
    const rot = { x: 0, y: 0 };

    const frame = (now) => {
      if (!start) start = now;
      const t = reduceMotion ? 99 : (now - start) / 1000;
      const intro = easeOut(Math.min(1, t / 1.3));
      const baseY = narrow ? -0.1 : -0.2;
      const sway = reduceMotion || pointer.active ? 0 : Math.sin(t * 0.35) * 0.07;
      const targetY = baseY + sway + (pointer.active ? pointer.x * 0.16 : 0) + (1 - intro) * 0.55;
      const targetX = 0.05 + (pointer.active ? pointer.y * 0.08 : 0);
      rot.y += (targetY - rot.y) * (reduceMotion ? 1 : 0.08);
      rot.x += (targetX - rot.x) * (reduceMotion ? 1 : 0.08);
      phone.rotation.set(rot.x, rot.y, 0);

      cards.forEach(({ mesh, l, delay }, i) => {
        const p = reduceMotion ? 1 : easeOut(Math.min(1, Math.max(0, (t - delay) / 1.1)));
        const bob = reduceMotion ? 0 : Math.sin(t * 0.8 + i * 1.7) * 0.012 * p;
        mesh.position.set(l.x * p, l.y * p + bob, l.z * p - (1 - p) * 0.2);
        mesh.rotation.set(0, l.ry * p + rot.y * 0.35, l.rz * p);
        mesh.material.opacity = p;
        mesh.scale.setScalar(0.7 + 0.3 * p);
      });

      renderer.render(scene, camera);
      if (running && !reduceMotion) raf = requestAnimationFrame(frame);
    };

    const play = () => {
      if (running || !visible || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(frame);
    };
    const pause = () => { running = false; cancelAnimationFrame(raf); };

    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) play(); else pause(); });
    io.observe(stage);
    const onVis = () => (document.hidden ? pause() : play());
    document.addEventListener('visibilitychange', onVis);
    // 大きさが変わると canvas は消えるので、その場で 1 枚描き直す
    const ro = new ResizeObserver(() => { resize(); renderer.render(scene, camera); });
    ro.observe(stage);
    const onScheme = () => { applyTheme().then(() => requestAnimationFrame(frame)).catch(() => {}); };
    darkMq.addEventListener('change', onScheme);

    // GPU が落ちたら写真に戻す
    const onContextLost = (e) => { e.preventDefault(); pause(); onLost?.(); };
    canvas.addEventListener('webglcontextlost', onContextLost);

    let cancelled = false;
    applyTheme().then(() => {
      if (cancelled) return;
      resize();
      renderer.render(scene, camera);
      onReady?.();
      if (reduceMotion) requestAnimationFrame(frame);
      else play();
    }).catch(() => { /* 写真のまま */ });

    return () => {
      cancelled = true;
      pause();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      darkMq.removeEventListener('change', onScheme);
      window.removeEventListener('pointermove', onPointer);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      cards.forEach(({ mesh }) => { mesh.material.map?.dispose(); mesh.material.dispose(); mesh.geometry.dispose(); });
      screenMat.map?.dispose();
      disposables.forEach((d) => d.dispose?.());
      renderer.dispose();
    };
  }, [stageRef, imgRef, onReady, onLost]);

  return <canvas ref={canvasRef} className="lp-hero-canvas" aria-hidden="true" />;
}
