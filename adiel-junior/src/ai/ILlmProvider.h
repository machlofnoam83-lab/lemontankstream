// =============================================================================
//  Adiel Junior — ILlmProvider
//  ממשק אחיד למנוע ה-AI המקומי (llama.cpp / stub / עתידי).
// =============================================================================
#pragma once

#include <atomic>
#include <functional>
#include <string>
#include <vector>

#include "core/Config.h"

namespace aj {

struct ChatMessage {
    std::string role;    // "system" | "user" | "assistant"
    std::string content;
};

class ILlmProvider {
public:
    virtual ~ILlmProvider() = default;

    // טוען את המודל (GGUF). מחזיר false אם נכשל.
    virtual bool load(const Config& cfg) = 0;
    virtual bool loaded() const = 0;

    // שם המודל / תיאור (לתצוגה)
    virtual std::string name() const = 0;

    // שיחה מלאה: מחזיר את התשובה המלאה ומזרים טוקנים דרך onToken.
    // cancel — ביטול שיתופי.
    virtual std::string chat(
        const std::vector<ChatMessage>& history,
        const std::function<void(const std::string&)>& onToken,
        std::atomic<bool>& cancel) = 0;

    // ניקוי היסטוריה / משאבים
    virtual void reset() = 0;
};

// יצירת ספק לפי cfg.engine ("llama" / "stub")
ILlmProvider* createLlmProvider(const Config& cfg);

} // namespace aj
