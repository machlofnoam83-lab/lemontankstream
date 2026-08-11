#include "app/CommandRouter.h"

namespace aj {

namespace {
bool contains(const std::string& text, const char* sub) {
    return text.find(sub) != std::string::npos;
}
} // namespace

CommandResult CommandRouter::route(const std::string& t) const {
    CommandResult r;

    // ---- מיקום ממשק ----
    if (contains(t, "שים בצד") || contains(t, "לצד") || contains(t, "שים בצד את עצמך")) {
        r.handled = true;
        r.action = CommandAction::Dock;
        r.reply = "בסדר, עובר לצד.";
        return r;
    }
    if (contains(t, "חזור לאמצע") || contains(t, "תחזור לאמצע") || contains(t, "לאמצע")) {
        r.handled = true;
        r.action = CommandAction::Center;
        r.reply = "חוזר לאמצע.";
        return r;
    }
    if (contains(t, "הסתר") || contains(t, "תסתתר") || contains(t, "תיעלם")) {
        r.handled = true;
        r.action = CommandAction::Hide;
        r.reply = "מסתתר. תגיד לי \"אדיאל ג'וניור\" כדי שאחזור.";
        return r;
    }
    if (contains(t, "תראה את עצמך") || contains(t, "תופיע") || contains(t, "תחזור")) {
        r.handled = true;
        r.action = CommandAction::Show;
        r.reply = "הנה אני.";
        return r;
    }

    // ---- מסך ----
    if (contains(t, "מה על המסך") || contains(t, "מה פתוח") || contains(t, "מה רואים") ||
        contains(t, "תסתכל על המסך") || contains(t, "תסכם לי את המסך") || contains(t, "מה קורה על המסך")) {
        r.handled = true;
        r.action = CommandAction::ScreenSummary;
        r.reply = "בודק את המסך שלך עכשיו.";
        return r;
    }

    // ---- שיחה ----
    if (contains(t, "נקה שיחה") || contains(t, "אתחל שיחה") || contains(t, "תשכח הכל")) {
        r.handled = true;
        r.action = CommandAction::ClearHistory;
        r.reply = "ניקיתי את השיחה. מתחילים מאפס.";
        return r;
    }

    // ---- שליטה ----
    if (contains(t, "תשתוק") || contains(t, "הפסק לדבר") || contains(t, "תפסיק לדבר") || contains(t, "תשתוק כבר")) {
        r.handled = true;
        r.action = CommandAction::StopSpeaking;
        r.reply = "מפסיק לדבר.";
        return r;
    }
    if (contains(t, "כבה את עצמך") || contains(t, "תכבה") || contains(t, "צא מהמערכת") ||
        contains(t, "סגור את עצמך")) {
        r.handled = true;
        r.action = CommandAction::Quit;
        r.reply = "נכבה. להתראות!";
        return r;
    }

    // ---- מידע ----
    if (contains(t, "מי אתה") || contains(t, "מה אתה") || contains(t, "איזה מנוע")) {
        r.handled = true;
        r.action = CommandAction::EngineInfo;
        r.reply.clear(); // התשובה מגיעה מה-AI (עדיף)
        return r;
    }

    return r;
}

} // namespace aj
