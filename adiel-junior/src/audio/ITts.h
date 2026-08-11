// =============================================================================
//  Adiel Junior — ITts / TtsBase
//  ממשק אחיד לדיבור מקומי (Sherpa-ONNX / Piper / Stub).
//  TtsBase: חוט עובד + תור — ספקים רק צריכים לסנתז שמע (synthesize).
// =============================================================================
#pragma once

#include <atomic>
#include <functional>
#include <string>
#include <thread>
#include <vector>

#include "core/Config.h"
#include "core/ThreadQueue.h"

namespace aj {

class ITts {
public:
    virtual ~ITts() = default;

    virtual bool init(const Config& cfg) = 0;
    virtual bool ready() const = 0;

    // דיבור אסינכרוני (תור פנימי). onDone נקרא בסיום ההשמעה.
    virtual void speak(const std::string& text, std::function<void()> onDone = nullptr) = 0;

    // עצירת דיבור נוכחי + ניקוי תור
    virtual void stop() = 0;

    // כמה עבודות דיבור ממתינות (כולל הדיבור הנוכחי)
    virtual size_t pending() const = 0;

    virtual std::string name() const = 0;
};

// ---------------------------------------------------------------------------
// בסיס משותף: תור דיבור + חוט עבודה + השמעה (WASAPI ב-Windows)
// ---------------------------------------------------------------------------
class TtsBase : public ITts {
public:
    TtsBase();
    ~TtsBase() override;

    void speak(const std::string& text, std::function<void()> onDone = nullptr) override;
    void stop() override;

protected:
    // סינתוז: מחזיר דגימות float [-1..1] וקצב הדגימה
    virtual std::vector<float> synthesize(const std::string& text, int& outSampleRate) = 0;

    // השמעת דגימות (ברירת מחדל: WASAPI; אפשר לדרוס בבדיקות)
    virtual void playSamples(const std::vector<float>& samples, int sampleRate);

public:
    size_t pending() const override {
        return (m_playing.load() ? 1u : 0u) + m_queue.size();
    }

private:
    struct Job {
        std::string text;
        std::function<void()> onDone;
    };
    void worker();

    ThreadQueue<Job> m_queue;
    std::thread m_thread;
    std::atomic<bool> m_running{true};
    std::atomic<bool> m_interrupt{false};
    std::atomic<bool> m_playing{false};
};

// מפעל לפי cfg.ttsEngine
ITts* createTtsEngine(const Config& cfg);

} // namespace aj
