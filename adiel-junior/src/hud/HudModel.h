// =============================================================================
//  Adiel Junior — HudModel
//  מצב הממשק ההולוגרפי — נתונים משותפים (תרדי-סייפ) לכל מנועי ה-HUD.
// =============================================================================
#pragma once

#include <mutex>
#include <string>
#include <vector>

namespace aj {

class HudModel {
public:
    // ---- עדכון (מכל חוט) ----
    void setMode(const std::string& m) { std::lock_guard<std::mutex> l(m_mtx); mode = m; }
    void setState(const std::string& s) { std::lock_guard<std::mutex> l(m_mtx); state = s; }
    void setStatus(const std::string& s) { std::lock_guard<std::mutex> l(m_mtx); status = s; }
    void setUserText(const std::string& t) { std::lock_guard<std::mutex> l(m_mtx); userText = t; }
    void setTokens(const std::string& t) { std::lock_guard<std::mutex> l(m_mtx); tokens = t; }
    void clearTokens() { std::lock_guard<std::mutex> l(m_mtx); tokens.clear(); }
    void setEngineName(const std::string& n) { std::lock_guard<std::mutex> l(m_mtx); engineName = n; }
    void setEnergy(float e) { std::lock_guard<std::mutex> l(m_mtx); energy = e; }
    void setBins(const std::vector<float>& b) { std::lock_guard<std::mutex> l(m_mtx); bins = b; }
    void setRunning(bool r) { std::lock_guard<std::mutex> l(m_mtx); running = r; }

    // ---- קריאה (מחוט הרינדור) ----
    std::string getMode() const { std::lock_guard<std::mutex> l(m_mtx); return mode; }
    std::string getState() const { std::lock_guard<std::mutex> l(m_mtx); return state; }
    std::string getStatus() const { std::lock_guard<std::mutex> l(m_mtx); return status; }
    std::string getUserText() const { std::lock_guard<std::mutex> l(m_mtx); return userText; }
    std::string getTokens() const { std::lock_guard<std::mutex> l(m_mtx); return tokens; }
    std::string getEngineName() const { std::lock_guard<std::mutex> l(m_mtx); return engineName; }
    float getEnergy() const { std::lock_guard<std::mutex> l(m_mtx); return energy; }
    std::vector<float> getBins() const { std::lock_guard<std::mutex> l(m_mtx); return bins; }
    bool getRunning() const { std::lock_guard<std::mutex> l(m_mtx); return running; }

private:
    mutable std::mutex m_mtx;
    std::string mode = "center";
    std::string state = "idle";
    std::string status = "אדיאל ג'וניור מוכן";
    std::string userText;
    std::string tokens;
    std::string engineName;
    float energy = 0.0f;
    std::vector<float> bins;
    bool running = true;
};

} // namespace aj
