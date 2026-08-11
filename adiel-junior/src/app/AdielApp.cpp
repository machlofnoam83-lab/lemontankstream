// =============================================================================
//  Adiel Junior — AdielApp
//  המנצח הראשי: מחבר AI + Vision + Voice + HUD.
// =============================================================================
#include "app/AdielApp.h"

#include <chrono>
#include <cmath>
#include <cstdio>
#include <functional>

#include "app/CommandRouter.h"
#include "ai/PromptBuilder.h"
#include "core/EventBus.h"
#include "core/Fft.h"
#include "core/Logger.h"
#include "core/ThreadQueue.h"
#include "vision/FrameDiffer.h"

#ifdef _WIN32
#include <windows.h>
#include <shellapi.h>
#include "audio/WasapiMicCapture.h"
#endif

#include <filesystem>

namespace aj {

namespace {
// שעון נייד (ms)
double nowMs() {
    return static_cast<double>(std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now().time_since_epoch()).count());
}
}

// ---------------------------------------------------------------------------
//  בנייה / הרס
// ---------------------------------------------------------------------------
AdielApp::AdielApp(const Config& cfg) : m_cfg(cfg) {}

AdielApp::~AdielApp() = default;

bool AdielApp::initModules() {
    logInfo("=== אדיאל ג'וניור — אתחול מודולים ===");

    // ---- AI Core
    m_llm.reset(createLlmProvider(m_cfg));
    if (m_llm && !m_llm->load(m_cfg)) {
        logWarn("AI: המודל לא נטען — המערכת תעבוד במצב מוגבל");
    }

    // ---- Vision
    m_screen.reset(createScreenSource(m_cfg));
    if (m_screen && m_cfg.visionEnabled && m_screen->start()) {
        logInfo("Vision: מקור מסך פעיל — %s", m_screen->name().c_str());
    } else {
        logWarn("Vision: לכידת מסך לא פעילה");
    }
    m_screenCtx.reset(new ScreenContext(m_cfg));

    // ---- קול
    m_wake.reset(createWakeWordEngine(m_cfg));
    m_wake->setOnDetected([this] { EventBus::instance().emit(EventType::WakeWordDetected); });

#ifdef _WIN32
    m_mic.reset(new WasapiMicCapture(m_cfg));
#else
    m_mic.reset(nullptr);
#endif
    if (m_mic && m_mic->start([this](const float* s, size_t n) { onMicSamples(s, n); })) {
        logInfo("Audio: מיקרופון פעיל — %s", m_mic->deviceName().c_str());
    } else {
        logWarn("Audio: מיקרופון לא זמין — קלט ידני בלבד");
    }

    m_stt.reset(createSttEngine(m_cfg));
    m_tts.reset(createTtsEngine(m_cfg));

    // ---- HUD
    m_hud.reset(createHud(m_cfg, [this](HudAction a) {
        switch (a) {
            case HudAction::Dock:        m_hud->setMode("docked"); break;
            case HudAction::Center:      m_hud->setMode("center"); break;
            case HudAction::Hide:        m_hud->setMode("hidden"); break;
            case HudAction::Show:        m_hud->setMode("center"); break;
            case HudAction::Close:       requestExit(); break;
            case HudAction::ListenToggle: onWakeWord(); break;
        }
    }));

    // ---- אירועים → HUD
    EventBus::instance().subscribe(EventType::StateChanged, [this](const Event& e) {
        m_hud->setState(e.payload);
    });
    EventBus::instance().subscribe(EventType::WakeWordDetected, [this](const Event&) {
        onWakeWord();
    });
    EventBus::instance().subscribe(EventType::ScreenChanged, [](const Event& e) {
        logDebug("Vision: %s", e.payload.c_str());
    });

    if (m_llm) m_hud->setEngineName(m_llm->name());
    m_hud->setStatus("אדיאל ג'וניור מוכן. אמור \"" + m_cfg.wakeKeyword + "\".");
    loadMemory();
    return true;
}

void AdielApp::initHotkeys() {
#ifdef _WIN32
    if (!m_cfg.hotkeysEnabled) return;

    // חלון נסתר למקשי קיצור
    HINSTANCE hInst = GetModuleHandle(nullptr);
    WNDCLASS wc{};
    wc.lpfnWndProc = [](HWND h, UINT m, WPARAM w, LPARAM l) -> LRESULT {
        AdielApp* app = reinterpret_cast<AdielApp*>(GetWindowLongPtr(h, GWLP_USERDATA));
        if (!app) return DefWindowProc(h, m, w, l);
        if (m == WM_HOTKEY) {
            app->onHotkey(static_cast<int>(w));
            return 0;
        }
        if (m == WM_APP) { // אירוע מגש
            if (l == WM_RBUTTONUP || l == WM_CONTEXTMENU || l == WM_LBUTTONUP) {
                app->trayCommand(0); // תפריט
            }
            return 0;
        }
        if (m == WM_COMMAND) {
            app->trayCommand(static_cast<int>(LOWORD(w)));
            return 0;
        }
        return DefWindowProc(h, m, w, l);
    };
    wc.hInstance = hInst;
    wc.lpszClassName = L"AdielJuniorHotkeyWindow";
    RegisterClass(&wc);
    HWND hwnd = CreateWindowEx(0, L"AdielJuniorHotkeyWindow", nullptr, 0, 0, 0, 0, 0,
                               HWND_MESSAGE, nullptr, hInst, nullptr);
    if (!hwnd) return;
    SetWindowLongPtr(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(this));
    m_hotkeyHwnd = hwnd;

    // מגש מערכת (tray)
    if (m_cfg.trayEnabled) initTray(hwnd);

    const auto& hk = m_cfg.hotkeys;
    const UINT mod = (hk.modifierCtrl ? MOD_CONTROL : 0) | (hk.modifierAlt ? MOD_ALT : 0);
    RegisterHotKey(hwnd, 1, mod, static_cast<UINT>(hk.listen));
    RegisterHotKey(hwnd, 2, mod, static_cast<UINT>(hk.dock));
    RegisterHotKey(hwnd, 3, mod, static_cast<UINT>(hk.center));
    RegisterHotKey(hwnd, 4, mod, static_cast<UINT>(hk.hide));
    RegisterHotKey(hwnd, 5, mod, static_cast<UINT>(hk.quit));
    RegisterHotKey(hwnd, 6, mod, static_cast<UINT>(hk.screen));
    logInfo("Hotkeys: פעילים (Ctrl+Alt+L/D/C/H/Q/S)");

    m_hotkeyThread = std::thread([hwnd] {
        MSG msg{};
        while (GetMessage(&msg, nullptr, 0, 0) > 0) {
            TranslateMessage(&msg);
            DispatchMessage(&msg);
        }
    });
#endif
}

#ifdef _WIN32
void AdielApp::onHotkey(int id) {
    switch (id) {
        case 1: onWakeWord(); break;                    // האזנה
        case 2: m_hud->setMode("docked"); break;        // שים בצד
        case 3: m_hud->setMode("center"); break;        // חזור לאמצע
        case 4: m_hud->setMode("hidden"); break;        // הסתר
        case 5: requestExit(); break;                   // צא
        case 6: handleUserText("מה על המסך"); break;    // סיכום מסך
    }
}
#endif

// ---------------------------------------------------------------------------
//  ריצה
// ---------------------------------------------------------------------------
int AdielApp::run() {
    if (!initModules()) return 1;
    initHotkeys();

    m_running = true;
    m_captureThread = std::thread([this] { runCaptureWorker(); });
    m_sttThread = std::thread([this] { runSttWorker(); });
    m_aiThread = std::thread([this] { runAiWorker(); });

    logInfo("=== אדיאל ג'וניור פעיל ===");
    m_hud->run(); // חוסם

    // כיבוי מסודר
    m_running = false;
    if (m_captureThread.joinable()) m_captureThread.join();
    if (m_sttThread.joinable()) m_sttThread.join();
    if (m_aiThread.joinable()) m_aiThread.join();
#ifdef _WIN32
    if (m_hotkeyThread.joinable()) {
        if (m_hotkeyHwnd) PostMessage(static_cast<HWND>(m_hotkeyHwnd), WM_CLOSE, 0, 0);
        m_hotkeyThread.join();
    }
#endif
    if (m_mic) m_mic->stop();
    if (m_screen) m_screen->stop();
    logInfo("=== אדיאל ג'וניור כובה ===");
    return 0;
}

void AdielApp::requestExit() {
    if (m_hud) m_hud->requestExit();
    else m_running = false;
}

// ---------------------------------------------------------------------------
//  מצב
// ---------------------------------------------------------------------------
void AdielApp::setState(AssistantState st) {
    std::lock_guard<std::mutex> lock(m_stateMtx);
    m_state = st;
    const char* name = "idle";
    switch (st) {
        case AssistantState::Idle:       name = "idle"; break;
        case AssistantState::Listening:  name = "listening"; break;
        case AssistantState::Processing: name = "processing"; break;
        case AssistantState::Thinking:   name = "thinking"; break;
        case AssistantState::Speaking:   name = "speaking"; break;
    }
    EventBus::instance().emit(EventType::StateChanged, name);
}

// ---------------------------------------------------------------------------
//  קול
// ---------------------------------------------------------------------------
void AdielApp::onWakeWord() {
    if (!m_running.load()) return;
    {
        std::lock_guard<std::mutex> lock(m_stateMtx);
        if (m_state != AssistantState::Idle) return; // כבר עסוקים
        m_state = AssistantState::Listening;
    }
    EventBus::instance().emit(EventType::StateChanged, "listening");
    logInfo("אדיאל ג'וניור: מקשיב...");

    m_hud->setStatus("מקשיב... דבר עכשיו");
    m_hud->clearTokens();

    {
        std::lock_guard<std::mutex> lock(m_utteranceMtx);
        m_utterance.clear();
        m_lastVoiceMs = 0.0;
    }
    m_listening = true;
    m_needScreen = false;
}

void AdielApp::onMicSamples(const float* samples, size_t count) {
    if (!m_running.load()) return;

    // מילת הפעלה (המנוע משתיק את עצמו כשהוא עסוק)
    m_wake->feed(samples, count);

    // FFT → HUD (גל קול)
    static Fft fft(1024);
    static std::vector<float> fftBuf;
    fftBuf.insert(fftBuf.end(), samples, samples + count);
    if (fftBuf.size() >= 1024) {
        fft.compute(fftBuf.data(), 1024);
        std::vector<float> bins;
        bins.reserve(fft.bins());
        for (size_t i = 0; i < fft.bins(); ++i) bins.push_back(fft.bin(i));
        m_hud->setBins(bins);
        m_hud->setEnergy(fft.energy());
        fftBuf.erase(fftBuf.begin(), fftBuf.begin() + 512); // חפיפה של 50%
    }

    // הקלטת פקודה אחרי מילת הפעלה
    if (!m_listening) return;

    const double nowMs = aj::nowMs();
    double rms = 0.0;
    for (size_t i = 0; i < count; ++i) rms += static_cast<double>(samples[i] * samples[i]);
    rms = std::sqrt(rms / static_cast<double>(count));
    if (rms > 0.012) m_lastVoiceMs = nowMs;

    {
        std::lock_guard<std::mutex> lock(m_utteranceMtx);
        m_utterance.insert(m_utterance.end(), samples, samples + count);
    }

    // שתיקה ממושכת → סיום הקלטה
    const double voiceAge = nowMs - m_lastVoiceMs;
    const bool gotSpeech = (m_lastVoiceMs > 0.0);
    if (gotSpeech && voiceAge > m_cfg.silenceTimeoutMs) {
        m_listening = false;
        std::vector<float> utterance;
        {
            std::lock_guard<std::mutex> lock(m_utteranceMtx);
            utterance.swap(m_utterance);
        }
        if (utterance.size() > 1600) { // > 0.1 שניות
            EventBus::instance().emit(EventType::SpeechStart);
            m_hud->setStatus("מעבד את הקול...");
            m_sttQueue.push(std::move(utterance));
        } else {
            logInfo("לא נקלט קול — חוזר למצב המתנה");
            setState(AssistantState::Idle);
            m_hud->setStatus("מוכן. אמור \"" + m_cfg.wakeKeyword + "\".");
        }
    }
}

void AdielApp::runSttWorker() {
    while (m_running.load()) {
        auto job = m_sttQueue.pop();
        if (!job) break;
        setState(AssistantState::Processing);
        const std::string text = m_stt->transcribe(job->data(), job->size());
        if (!text.empty()) {
            EventBus::instance().emit(EventType::UserSpeech, text);
            handleUserText(text);
        } else {
            logWarn("STT: לא זוהה טקסט");
            setState(AssistantState::Idle);
            m_hud->setStatus("לא הבנתי. אמור \"" + m_cfg.wakeKeyword + "\".");
        }
    }
}

void AdielApp::handleUserText(const std::string& text) {
    logInfo("משתמש: %s", text.c_str());
    m_hud->setUserText(text);
    m_hud->setStatus("מעבד...");

    // 1. ניתוב פקודות מערכת
    CommandRouter router;
    CommandResult cmd = router.route(text);

    if (cmd.handled && !cmd.reply.empty()) {
        // הוספה להיסטוריה
        {
            std::lock_guard<std::mutex> lock(m_historyMtx);
            m_history.push_back({"user", text});
            if (!cmd.reply.empty()) m_history.push_back({"assistant", cmd.reply});
        }
        // ביצוע
        switch (cmd.action) {
            case CommandAction::Dock:         m_hud->setMode("docked"); break;
            case CommandAction::Center:       m_hud->setMode("center"); break;
            case CommandAction::Hide:         m_hud->setMode("hidden"); break;
            case CommandAction::Show:         m_hud->setMode("center"); break;
            case CommandAction::ClearHistory: {
                std::lock_guard<std::mutex> lock(m_historyMtx);
                m_history.clear();
                m_llm->reset();
                break;
            }
            case CommandAction::Quit:         requestExit(); break;
            case CommandAction::StopSpeaking: m_tts->stop(); break;
            default: break;
        }
        if (cmd.action != CommandAction::StopSpeaking) {
            speak(cmd.reply);
        }
        return;
    }

    // 2. פקודת סיכום מסך — דורשת הקשר רענן
    if (cmd.handled && cmd.action == CommandAction::ScreenSummary) {
        m_needScreen = true;
        speak(cmd.reply);
        think(text, screenContextForAi(true));
        return;
    }

    // 3. שיחה רגילה → AI
    const bool wantsScreen = (text.find("מסך") != std::string::npos) || m_needScreen.load();
    m_needScreen = false;
    think(text, wantsScreen ? screenContextForAi(true) : screenContextForAi(false));
}

// ---------------------------------------------------------------------------
//  AI
// ---------------------------------------------------------------------------
void AdielApp::think(const std::string& userText, const std::string& screenContext) {
    {
        std::lock_guard<std::mutex> lock(m_historyMtx);
        m_history.push_back({"user", userText});
        // הגבלת היסטוריה
        if (static_cast<int>(m_history.size()) > m_cfg.historyLimit * 2) {
            m_history.erase(m_history.begin(), m_history.begin() + 2);
        }
    }
    m_sentenceBuf.clear();
    m_aiQueue.push({userText, screenContext});
}

void AdielApp::runAiWorker() {
    while (m_running.load()) {
        auto job = m_aiQueue.pop();
        if (!job) break;

        setState(AssistantState::Thinking);
        m_hud->setStatus("חושב...");
        m_hud->clearTokens();

        std::vector<ChatMessage> history;
        {
            std::lock_guard<std::mutex> lock(m_historyMtx);
            history = PromptBuilder::buildHistory(m_history, job->screenContext);
        }

        std::atomic<bool> cancel{false};
        std::string full;
        bool spokenAny = false;
        m_replyActive = true;

        auto onToken = [&](const std::string& piece) {
            full += piece;
            m_hud->setTokens(full);

            // סטרימינג קולי: משפט שלם → דיבור מיד (בלי לחכות לסוף התשובה)
            m_sentenceBuf += piece;
            const char last = m_sentenceBuf.empty() ? '\0' : m_sentenceBuf.back();
            // סוף משפט: נקודה/קריאה/סימן שאלה, או הבית האחרון של "…" (UTF-8: E2 80 A6)
            const bool endOfSentence =
                last == '.' || last == '!' || last == '?' ||
                (static_cast<unsigned char>(last) == 0xA6);
            const size_t minLen = 24;
            if (endOfSentence && m_sentenceBuf.size() >= minLen) {
                std::string sentence = m_sentenceBuf;
                m_sentenceBuf.clear();
                setState(AssistantState::Speaking);
                spokenAny = true;
                m_tts->speak(sentence);
            }
        };

        const std::string reply = m_llm->chat(history, onToken, cancel);

        // שארית התשובה — משפט אחרון
        if (!m_sentenceBuf.empty()) {
            setState(AssistantState::Speaking);
            spokenAny = true;
            m_tts->speak(m_sentenceBuf, [this] {
                if (m_tts->pending() == 0 && !m_replyActive.load()) {
                    setState(AssistantState::Idle);
                }
            });
            m_sentenceBuf.clear();
        } else if (spokenAny && m_tts->pending() == 0) {
            setState(AssistantState::Idle);
        }
        m_replyActive = false;

        {
            std::lock_guard<std::mutex> lock(m_historyMtx);
            m_history.push_back({"assistant", reply.empty() ? "(ללא תשובה)" : reply});
        }

        logInfo("אדיאל ג'וניור: %s", reply.c_str());
        m_hud->setStatus("מוכן. אמור \"" + m_cfg.wakeKeyword + "\".");
        m_hud->setTokens(reply);
        if (!spokenAny) setState(AssistantState::Idle);

        // זיכרון מתמשך + איסוף נתונים לקורפוס
        saveMemory();
        collectData(job->userText, reply);
    }
}

// ---------------------------------------------------------------------------
//  Vision
// ---------------------------------------------------------------------------
void AdielApp::runCaptureWorker() {
    if (!m_screen) return;

    FrameDiffer differ;
    const int timeout = std::max(16, 1000 / std::max(1, m_cfg.captureFps));

    while (m_running.load()) {
        auto frame = m_screen->capture(timeout);
        if (!frame || frame->empty) continue;

        const double ratio = differ.diff(frame);
        const bool significant = ratio > m_cfg.changeThreshold;

        // עדכון הקשר (כותרת חלון) על כל שינוי משמעותי
        if (significant) {
            updateScreenContext(frame, false);
            char buf[96];
            snprintf(buf, sizeof(buf), "שינוי מסך משמעותי (%.1f%%)", ratio * 100.0);
            EventBus::instance().emit(EventType::ScreenChanged, buf);
        }
    }
}

void AdielApp::updateScreenContext(const std::shared_ptr<Frame>& frame, bool forceOcr) {
    const uint64_t now = static_cast<uint64_t>(nowMs());
    const bool wantOcr = forceOcr || m_needScreen.load();

    bool doOcr = false;
    if (wantOcr && m_screenCtx->ocrAvailable()) {
        if (forceOcr || now - m_lastOcrMs > 3000) doOcr = true; // חסכון ב-CPU
    }

    int rx = 0, ry = 0, rw = 0, rh = 0;
    if (doOcr && m_screen) {
        // OCR של אזור השינוי בלבד (מהיר יותר)
        // (האזור מחושב ע"י ה-FrameDiffer — כאן ניקח את כל המסך לפשטות/אמינות)
        rx = 0; ry = 0; rw = frame->width; rh = frame->height;
    }

    ScreenSnapshot snap = m_screenCtx->build(frame, doOcr, rx, ry, rw, rh);
    {
        std::lock_guard<std::mutex> lock(m_snapshotMtx);
        m_lastSnapshot = std::move(snap);
        if (doOcr) m_lastOcrMs = now;
    }
    if (doOcr) {
        EventBus::instance().emit(EventType::ScreenContextReady, m_lastSnapshot.ocrText);
    }
}

std::string AdielApp::screenContextForAi(bool forceRefresh) {
    std::lock_guard<std::mutex> lock(m_snapshotMtx);

    // רענון אם אין snapshot או אם ביקשו רענון
    if (m_lastSnapshot.empty() || forceRefresh) {
        // ננסה לכידת פריים מיידית
        if (m_screen) {
            auto frame = m_screen->capture(500);
            if (frame && !frame->empty) {
                bool ocr = forceRefresh && m_screenCtx->ocrAvailable();
                ScreenSnapshot snap = m_screenCtx->build(frame, ocr, 0, 0,
                                                         frame->width, frame->height);
                m_lastSnapshot = std::move(snap);
            }
        }
    }

    std::string title = m_lastSnapshot.windowTitle;
    if (!m_lastSnapshot.processName.empty()) {
        title += " (" + m_lastSnapshot.processName + ")";
    }
    return PromptBuilder::screenContextBlock(title, m_lastSnapshot.ocrText,
                                             m_lastSnapshot.width, m_lastSnapshot.height);
}

// ---------------------------------------------------------------------------
//  דיבור
// ---------------------------------------------------------------------------
void AdielApp::speak(const std::string& text) {
    if (text.empty()) return;
    setState(AssistantState::Speaking);
    m_tts->speak(text, [this] {
        if (m_tts->pending() == 0) {
            setState(AssistantState::Idle);
        }
    });
}

// ---------------------------------------------------------------------------
//  זיכרון מתמשך
// ---------------------------------------------------------------------------
void AdielApp::loadMemory() {
    std::string path = m_cfg.historyFile.empty() ? "data/history.json" : m_cfg.historyFile;
    json::Value root = json::parseFile(path);
    const json::Value* arr = root.getArray("messages");
    if (!arr) return;
    std::lock_guard<std::mutex> lock(m_historyMtx);
    for (const auto& m : arr->array()) {
        ChatMessage msg;
        msg.role = m.getString("role");
        msg.content = m.getString("content");
        if (!msg.role.empty() && !msg.content.empty()) m_history.push_back(std::move(msg));
    }
    if (!m_history.empty()) {
        logInfo("זיכרון: נטענו %zu הודעות מהשיחה הקודמת", m_history.size());
    }
}

void AdielApp::saveMemory() {
    std::vector<ChatMessage> hist;
    {
        std::lock_guard<std::mutex> lock(m_historyMtx);
        hist = m_history;
    }
    json::Value root;
    json::Value arr;
    for (const auto& m : hist) {
        json::Value jm;
        jm["role"] = json::Value(m.role);
        jm["content"] = json::Value(m.content);
        arr.push(jm);
    }
    root["messages"] = arr;
    try {
        std::filesystem::path p(m_cfg.historyFile.empty() ? "data/history.json" : m_cfg.historyFile);
        if (p.has_parent_path()) std::filesystem::create_directories(p.parent_path());
    } catch (...) {}
    json::writeFile(m_cfg.historyFile.empty() ? "data/history.json" : m_cfg.historyFile, root, true);
}

// איסוף שיחות אמיתיות → קורפוס האימון שלנו (U:/A: — מזין את build_corpus)
void AdielApp::collectData(const std::string& user, const std::string& assistant) {
    if (!m_cfg.dataCollection || user.empty() || assistant.empty()) return;
    try {
        std::filesystem::path dir(m_cfg.rawDataDir.empty() ? "data/raw" : m_cfg.rawDataDir);
        std::filesystem::create_directories(dir);
        std::FILE* f = std::fopen((dir / "conversations.txt").string().c_str(), "ab");
        if (!f) return;
        std::fprintf(f, "U: %s\nA: %s\n\n", user.c_str(), assistant.c_str());
        std::fclose(f);
    } catch (...) {}
}

// ---------------------------------------------------------------------------
//  מגש מערכת (Windows)
// ---------------------------------------------------------------------------
#ifdef _WIN32
namespace {
constexpr UINT kTrayMsg = WM_APP + 1;
constexpr UINT kTrayId = 1;
// מזההי פקודות תפריט
constexpr int kCmdListen = 1001;
constexpr int kCmdDock   = 1002;
constexpr int kCmdCenter = 1003;
constexpr int kCmdHide   = 1004;
constexpr int kCmdExit   = 1005;
}

void AdielApp::initTray(HWND hwnd) {
    NOTIFYICONDATAW nid{};
    nid.cbSize = sizeof(nid);
    nid.hWnd = hwnd;
    nid.uID = kTrayId;
    nid.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
    nid.uCallbackMessage = kTrayMsg;
    nid.hIcon = LoadIconW(GetModuleHandleW(nullptr), MAKEINTRESOURCEW(1));
    if (!nid.hIcon) nid.hIcon = LoadIconW(nullptr, IDI_APPLICATION);
    wcscpy_s(nid.szTip, L"אדיאל ג'וניור — עוזר אישי חכם");
    m_trayAdded = Shell_NotifyIconW(NIM_ADD, &nid) == TRUE;
    logInfo("Tray: %s", m_trayAdded ? "איקון נוסף למגש" : "כשל בהוספת איקון למגש");
}

void AdielApp::trayCommand(int id) {
    if (id == 0) {
        // תפריט הקשר
        HMENU menu = CreatePopupMenu();
        AppendMenuW(menu, MF_STRING, kCmdListen, L"האזנה (מילת הפעלה)");
        AppendMenuW(menu, MF_SEPARATOR, 0, nullptr);
        AppendMenuW(menu, MF_STRING, kCmdDock, L"שים בצד");
        AppendMenuW(menu, MF_STRING, kCmdCenter, L"חזור לאמצע");
        AppendMenuW(menu, MF_STRING, kCmdHide, L"הסתר");
        AppendMenuW(menu, MF_SEPARATOR, 0, nullptr);
        AppendMenuW(menu, MF_STRING, kCmdExit, L"יציאה");
        POINT pt{};
        GetCursorPos(&pt);
        SetForegroundWindow(static_cast<HWND>(m_hotkeyHwnd));
        const UINT cmd = static_cast<UINT>(TrackPopupMenu(
            menu, TPM_RIGHTBUTTON | TPM_RETURNCMD, pt.x, pt.y, 0,
            static_cast<HWND>(m_hotkeyHwnd), nullptr));
        DestroyMenu(menu);
        if (cmd != 0) trayCommand(static_cast<int>(cmd));
        return;
    }
    switch (id) {
        case kCmdListen: onWakeWord(); break;
        case kCmdDock:   m_hud->setMode("docked"); break;
        case kCmdCenter: m_hud->setMode("center"); break;
        case kCmdHide:   m_hud->setMode("hidden"); break;
        case kCmdExit:   requestExit(); break;
    }
}
#endif // _WIN32

} // namespace aj
