// =============================================================================
//  Adiel Junior — IWakeWord
//  ממשק אחיד למנועי מילת הפעלה (Porcupine / Sherpa-ONNX / Stub).
//  כל מנוע מקבל 16kHz מונו float32 ויכול להפעיל callback בזיהוי.
// =============================================================================
#pragma once

#include <cstddef>
#include <functional>
#include <string>

#include "core/Config.h"

namespace aj {

class IWakeWord {
public:
    using OnDetected = std::function<void()>;

    virtual ~IWakeWord() = default;

    // אתחול המנוע (טוען מודלים). false = המנוע לא זמין.
    virtual bool init(const Config& cfg) = 0;

    // הזנת חתיכת שמע (16kHz מונו float32)
    virtual void feed(const float* samples, size_t count) = 0;

    // חזרה: המשתמש אמר את מילת ההפעלה
    virtual void setOnDetected(OnDetected cb) = 0;

    // השתקה זמנית (כשהמערכת כבר מקשיבה)
    virtual void setMuted(bool muted) = 0;

    virtual std::string name() const = 0;
};

// מפעל לפי cfg.wakeEngine
IWakeWord* createWakeWordEngine(const Config& cfg);

} // namespace aj
