// =============================================================================
//  Adiel Junior — EventBus
//  אוטובוס אירועים תרדי-סייפ (תבנית pub/sub) המקשר בין כל רכיבי המנוע.
// =============================================================================
#pragma once

#include <functional>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

namespace aj {

enum class EventType {
    // קול
    WakeWordDetected,   // מילת ההפעלה נשמעה
    UserSpeech,         // פקודה קולית זוהתה (std::string — הטקסט)
    SpeechStart,        // המשתמש התחיל לדבר
    TtsStarted,         // המערכת החלה לדבר
    TtsFinished,
    // AI
    AiThinking,         // ה-AI מעבד
    AiToken,            // טוקן חדש נוצר (std::string)
    AiReply,            // תשובה מלאה (std::string)
    AiError,            // שגיאה (std::string)
    // Vision
    ScreenChanged,      // שינוי משמעותי במסך (const char* — תיאור קצר)
    ScreenContextReady, // הקשר מסך נבנה (std::string)
    // HUD / מערכת
    HudModeChanged,     // std::string: "center"|"docked"|"hidden"
    StateChanged,       // std::string: "idle"|"listening"|"processing"|"thinking"|"speaking"
    Shutdown,
};

// אירוע מוכלל: כל אירוע נושא מחרוזת אופציונלית אחת (רוב המקרים).
struct Event {
    EventType type;
    std::string payload;
    Event(EventType t, std::string p = {}) : type(t), payload(std::move(p)) {}
};

class EventBus {
public:
    using Handler = std::function<void(const Event&)>;

    static EventBus& instance() {
        static EventBus bus;
        return bus;
    }

    // הרשמה: מחזיר id לביטול הרשמה
    size_t subscribe(EventType type, Handler h) {
        std::lock_guard<std::mutex> lock(m_mtx);
        m_handlers[type].push_back({m_nextId++, std::move(h)});
        return m_handlers[type].back().first;
    }

    void unsubscribe(EventType type, size_t id) {
        std::lock_guard<std::mutex> lock(m_mtx);
        auto& vec = m_handlers[type];
        vec.erase(std::remove_if(vec.begin(), vec.end(),
                                 [id](const auto& e) { return e.first == id; }),
                  vec.end());
    }

    void emit(EventType type, std::string payload = {}) {
        // העתקת הרשימה תחת מנעול, קריאה מחוץ למנעול (מונע deadlock)
        std::vector<Handler> copy;
        {
            std::lock_guard<std::mutex> lock(m_mtx);
            auto it = m_handlers.find(type);
            if (it == m_handlers.end()) return;
            copy.reserve(it->second.size());
            for (auto& [id, h] : it->second) copy.push_back(h);
        }
        Event ev(type, std::move(payload));
        for (auto& h : copy) {
            try { h(ev); } catch (...) {}
        }
    }

private:
    std::mutex m_mtx;
    size_t m_nextId = 1;
    std::unordered_map<EventType, std::vector<std::pair<size_t, Handler>>> m_handlers;
};

} // namespace aj
