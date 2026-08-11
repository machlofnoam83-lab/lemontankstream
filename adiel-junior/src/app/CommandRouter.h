// =============================================================================
//  Adiel Junior — CommandRouter
//  ניתוב פקודות קוליות בעברית: "שים בצד", "הסתר", "מה על המסך" וכו'.
//  (התאמת תת-מחרוזות על UTF-8 — עובד מעולה לעברית)
// =============================================================================
#pragma once

#include <string>

namespace aj {

enum class CommandAction {
    None,
    Dock,            // שים בצד
    Center,          // חזור לאמצע
    Hide,            // הסתר
    Show,            // תראה את עצמך
    ClearHistory,    // נקה שיחה
    Quit,            // כבה / צא
    StopSpeaking,    // שתוק
    ScreenSummary,   // מה על המסך
    EngineInfo,      // מי אתה / מה המנוע
};

struct CommandResult {
    bool handled = false;
    CommandAction action = CommandAction::None;
    std::string reply;  // אישור קולי בעברית
};

class CommandRouter {
public:
    // מנתב טקסט משתמש לפקודת מערכת (אם רלוונטי)
    CommandResult route(const std::string& text) const;
};

} // namespace aj
