#include "ai/StubLlm.h"

#include <chrono>
#include <ctime>
#include <thread>

#include "core/Logger.h"

namespace aj {

namespace {
// "מזרים" את התשובה טוקן-אחר-טוקן כדי לדמות סטרימינג אמיתי
void stream(const std::string& text,
            const std::function<void(const std::string&)>& onToken,
            std::atomic<bool>& cancel, int delayMs = 14) {
    std::string cur;
    for (char c : text) {
        if (cancel.load()) return;
        cur += c;
        bool boundary = (c == ' ' || c == '\n');
        if (boundary) {
            if (onToken) onToken(cur);
            cur.clear();
            std::this_thread::sleep_for(std::chrono::milliseconds(delayMs));
        }
    }
    if (!cur.empty() && onToken) onToken(cur);
}
} // namespace

bool StubLlm::load(const Config& cfg) {
    m_lang = cfg.language;
    m_loaded = true;
    logInfo("StubLlm: מצב הדגמה פעיל (אין צורך במודל)");
    return true;
}

std::string StubLlm::chat(const std::vector<ChatMessage>& history,
                          const std::function<void(const std::string&)>& onToken,
                          std::atomic<bool>& cancel) {
    // לקיחת הודעת המשתמש האחרונה
    std::string user;
    for (auto it = history.rbegin(); it != history.rend(); ++it) {
        if (it->role == "user") { user = it->content; break; }
    }

    std::string reply;

    // שעה
    if (user.find("שעה") != std::string::npos) {
        std::time_t now = std::time(nullptr);
        std::tm tmv{};
#ifdef _WIN32
        localtime_s(&tmv, &now);
#else
        localtime_r(&now, &tmv);
#endif
        char buf[64];
        std::strftime(buf, sizeof(buf), "%H:%M", &tmv);
        reply = std::string("השעה כעת ") + buf + ". כיצד אוכל לעזור?";
    }
    // תאריך
    else if (user.find("תאריך") != std::string::npos || user.find("היום") != std::string::npos) {
        std::time_t now = std::time(nullptr);
        std::tm tmv{};
#ifdef _WIN32
        localtime_s(&tmv, &now);
#else
        localtime_r(&now, &tmv);
#endif
        char buf[64];
        std::strftime(buf, sizeof(buf), "%d/%m/%Y", &tmv);
        reply = std::string("היום בתאריך ") + buf + ".";
    }
    // מסך
    else if (user.find("מסך") != std::string::npos || user.find("פתוח") != std::string::npos) {
        reply = "אני רואה את המסך שלך דרך מערכת הראייה. במצב הדגמה אני מדווח על החלון הפעיל בלבד. במצב מלא עם מודל 3B אנתח עבורך את התוכן.";
    }
    // מי אתה
    else if (user.find("מי אתה") != std::string::npos || user.find("את מי") != std::string::npos) {
        reply = "אני אדיאל ג'וניור, העוזר האישי שלך. רץ מקומית על המחשב שלך במנוע C++ טהור, בלי ענן, בלי אינטרנט.";
    }
    else if (user.find("שלום") != std::string::npos) {
        reply = "שלום! מה נשמע? אני כאן כדי לעזור.";
    }
    // ברירת מחדל
    else {
        reply = "מצב הדגמה פעיל ללא מודל שפה. כדי לקבל תשובות חכמות, הורד מודל Qwen2.5-3B בפורמט GGUF לתיקיית models והגדר אותו בקובץ הקונפיגורציה.";
    }

    stream(reply, onToken, cancel);
    return reply;
}

} // namespace aj
