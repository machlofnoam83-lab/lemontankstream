// =============================================================================
//  Adiel Junior — IHud
//  ממשק אחיד לממשק ההולוגרפי: Direct2D/DirectComposition (Windows) / Null (headless).
// =============================================================================
#pragma once

#include <functional>
#include <string>
#include <vector>

#include "core/Config.h"

namespace aj {

// פעולות ממשק שמשתמש יכול ללחוץ
enum class HudAction { Dock, Center, Hide, Show, Close, ListenToggle };

class IHud {
public:
    using ActionCallback = std::function<void(HudAction)>;

    virtual ~IHud() = default;

    virtual bool init(const Config& cfg, ActionCallback onAction) = 0;

    // רץ בלולאת הודעות עד requestExit. חוסם.
    virtual void run() = 0;
    virtual void requestExit() = 0;

    // עדכוני מצב (תרדי-סייפ)
    virtual void setMode(const std::string& mode) = 0;   // "center" | "docked" | "hidden"
    virtual void setStatus(const std::string& status) = 0;
    virtual void setUserText(const std::string& text) = 0;
    virtual void setTokens(const std::string& text) = 0;
    virtual void clearTokens() = 0;
    virtual void setEngineName(const std::string& name) = 0;
    virtual void setEnergy(float energy) = 0;            // [0..1] — פעימות הטבעת
    virtual void setBins(const std::vector<float>& bins) = 0; // גלי קול (FFT)
    virtual void setState(const std::string& state) = 0; // "idle" | "listening" | ...

    virtual std::string mode() const = 0;
};

// מפעל: D2D (Windows) / Null
IHud* createHud(const Config& cfg, IHud::ActionCallback onAction = nullptr);

} // namespace aj
