"use client";

import { useEffect, useState } from "react";

type NoticeTone = "info" | "success" | "warning";
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function useMobileApp(onNotice: (message: string, tone?: NoticeTone) => void) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installGuide, setInstallGuide] = useState("");
  const [isStandalone, setIsStandalone] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    const updateStandalone = () => {
      const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
      setIsStandalone(standaloneQuery.matches || navigatorWithStandalone.standalone === true);
    };
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setInstallGuide("");
      setIsStandalone(true);
    };
    const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));

    updateStandalone();
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    standaloneQuery.addEventListener?.("change", updateStandalone);
    if ("serviceWorker" in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      standaloneQuery.removeEventListener?.("change", updateStandalone);
    };
  }, []);

  async function toggleBrowserFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen({ navigationUI: "hide" });
        return;
      }
      onNotice("当前浏览器不支持网页全屏，可从“我的”添加到桌面后运行", "warning");
    } catch {
      onNotice("浏览器没有允许全屏，请从“我的”添加到桌面后运行", "warning");
    }
  }

  async function installMobileApp() {
    if (isStandalone) return onNotice("Micosm Game 已经从手机桌面运行", "success");
    if (installPrompt) {
      try {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        setInstallPrompt(null);
        if (choice.outcome === "accepted") {
          setInstallGuide("");
          return;
        }
      } catch {
        setInstallPrompt(null);
      }
    }
    const userAgent = navigator.userAgent;
    const guide = !window.isSecureContext
      ? "当前是局域网 HTTP 测试地址。请打开浏览器菜单，选择“添加到手机”或“添加到主屏幕”；正式 HTTPS 地址可直接安装。"
      : /MicroMessenger/i.test(userAgent)
        ? "请点微信右上角菜单，选择“在浏览器打开”，再从浏览器菜单添加到手机桌面。"
        : /iPhone|iPad|iPod/i.test(userAgent)
          ? "请在 Safari 点底部“分享”，再选择“添加到主屏幕”。"
          : "请打开浏览器菜单，选择“安装应用”或“添加到主屏幕”。";
    setInstallGuide(guide);
    onNotice("请按照“我的”页面下方提示添加到桌面");
  }

  return {
    installGuide,
    isFullscreen,
    isStandalone,
    dismissInstallGuide: () => setInstallGuide(""),
    installMobileApp,
    toggleBrowserFullscreen,
  };
}
