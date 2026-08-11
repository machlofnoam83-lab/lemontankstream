// =============================================================================
//  Adiel Junior — AdielApp
//  המנצח הראשי: מחבר את כל הרכיבים —
//  AI Core (llama.cpp) + DXGI Vision + Voice (Wake/STT/TTS) + Holographic HUD.
// =============================================================================
#pragma once

#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include "ai/ILlmProvider.h"
#include "audio/IAudioSource.h"
#include "audio/IStt.h"
#include "audio/ITts.h"
#include "audio/IWakeWord.h"
#include "core/Config.h"
#include "core/ThreadQueue.h"
#include "hud/IHud.h"
#include "vision/IScreenSource.h"
#include "vision/ScreenContext.h"

namespace aj {

struct AiJob {
    std::string userText;
    std::string screenContext;
};

enum class AssistantState { Idle, Listening, Processing, Thinking, Speaking };

class AdielApp {
public:
    explicit AdielApp(const Config& cfg);
    ~AdielApp();

    // מאתחל רכיבים ומריץ את לולאת ה-HUD. חוסם עד יציאה.
    int run();

    // עצירה ידנית (מחוט אחר)
    void requestExit();

private:
    // ---- אתחול ----
    bool initModules();
    void initHotkeys();

    // ---- מצב ----
    void setState(AssistantState st);

    // ---- קול ----
    void onWakeWord();
    void onMicSamples(const float* samples, size_t count);
    void runSttWorker();
    void handleUserText(const std::string& text);

    // ---- AI ----
    void runAiWorker();
    void think(const std::string& userText, const std::string& screenContext);

    // ---- Vision ----
    void runCaptureWorker();
    void updateScreenContext(const std::shared_ptr<Frame>& frame, bool forceOcr);

    // ---- כללי ----
    void speak(const std::string& text);
    std::string screenContextForAi(bool forceRefresh);

    // ---- זיכרון ואיסוף נתונים ----
    void loadMemory();                                   // טעינת היסטוריה מקובץ
    void saveMemory();                                   // שמירת היסטוריה
    void collectData(const std::string& user, const std::string& assistant);

#ifdef _WIN32
    // ---- מגש מערכת ----
    void initTray(HWND hwnd);
    void trayCommand(int id);
#endif

#ifdef _WIN32
    void onHotkey(int id);
#endif

    // תורים פנימיים
    ThreadQueue<std::vector<float>> m_sttQueue;
    ThreadQueue<AiJob> m_aiQueue;

    const Config& m_cfg;

    // מנועים
    std::unique_ptr<ILlmProvider>   m_llm;
    std::unique_ptr<IScreenSource>  m_screen;
    std::unique_ptr<ScreenContext>  m_screenCtx;
    std::unique_ptr<IAudioSource>   m_mic;
    std::unique_ptr<IWakeWord>      m_wake;
    std::unique_ptr<IStt>           m_stt;
    std::unique_ptr<ITts>           m_tts;
    std::unique_ptr<IHud>           m_hud;

    // חוטים
    std::thread m_captureThread;
    std::thread m_sttThread;
    std::thread m_aiThread;
    std::thread m_hotkeyThread;
    std::atomic<bool> m_running{false};

    // מצב פנימי
    std::atomic<AssistantState> m_state{AssistantState::Idle};
    std::mutex m_stateMtx;

    // הקלטת פקודה
    std::vector<float> m_utterance;      // דגימות 16k של הפקודה הנוכחית
    std::mutex m_utteranceMtx;
    double m_lastVoiceMs = 0;
    bool m_listening = false;
    std::atomic<bool> m_needScreen{false};

    // הקשר מסך אחרון
    ScreenSnapshot m_lastSnapshot;
    std::mutex m_snapshotMtx;
    uint64_t m_lastOcrMs = 0;

    // שיחה
    std::vector<ChatMessage> m_history;
    std::mutex m_historyMtx;

    // סטרימינג TTS
    std::string m_sentenceBuf;
    std::atomic<bool> m_replyActive{false};

    // מקשים חמים (Windows)
    void* m_hotkeyHwnd = nullptr;
    bool m_trayAdded = false;
};

} // namespace aj
