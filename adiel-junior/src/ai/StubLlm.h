// =============================================================================
//  Adiel Junior — StubLlm
//  ספק AI "מצב הדגמה" ללא מודל: עונה בעברית על שאלות בסיסיות
//  (שעה, מזג אוויר אקראי, פקודות מערכת) ומזרים טוקנים לצורך בדיקת ה-HUD.
//  שימושי לבדיקת המנוע כולו לפני הורדת מודל ה-3B.
// =============================================================================
#pragma once

#include "ai/ILlmProvider.h"

namespace aj {

class StubLlm final : public ILlmProvider {
public:
    bool load(const Config& cfg) override;
    bool loaded() const override { return m_loaded; }
    std::string name() const override { return "StubLlm (מצב הדגמה ללא מודל)"; }
    std::string chat(const std::vector<ChatMessage>& history,
                     const std::function<void(const std::string&)>& onToken,
                     std::atomic<bool>& cancel) override;
    void reset() override {}

private:
    std::atomic<bool> m_loaded{false};
    std::string m_lang = "he";
};

} // namespace aj
