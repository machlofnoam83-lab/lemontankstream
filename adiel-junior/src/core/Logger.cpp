#include "core/Logger.h"

#include <ctime>
#include <filesystem>

#ifdef _WIN32
#include <windows.h>
#endif

namespace aj {

Logger& Logger::instance() {
    static Logger s_instance;
    return s_instance;
}

const char* Logger::levelName(LogLevel lvl) {
    switch (lvl) {
        case LogLevel::Debug: return "DBG";
        case LogLevel::Info:  return "INF";
        case LogLevel::Warn:  return "WRN";
        case LogLevel::Error: return "ERR";
    }
    return "???";
}

void Logger::setFile(const std::string& path) {
    std::lock_guard<std::mutex> lock(m_mtx);
    m_filePath = path;
    if (m_file) { std::fclose(m_file); m_file = nullptr; }
    if (!m_filePath.empty()) {
        // יצירת תיקיית ההורה אם חסרה (autofix)
        try {
            std::filesystem::path p(path);
            if (p.has_parent_path()) {
                std::filesystem::create_directories(p.parent_path());
            }
        } catch (...) {}
        m_file = std::fopen(m_filePath.c_str(), "a");
        m_fileEnabled = (m_file != nullptr);
    }
}

void Logger::vlog(LogLevel lvl, const char* fmt, va_list args) {
    if (lvl < m_minLevel) return;

    // חותמת זמן
    char ts[32];
    std::time_t now = std::time(nullptr);
    std::tm tmv{};
#ifdef _WIN32
    localtime_s(&tmv, &now);
#else
    localtime_r(&now, &tmv);
#endif
    std::strftime(ts, sizeof(ts), "%H:%M:%S", &tmv);

    // עיצוב ההודעה
    char msg[4096];
    vsnprintf(msg, sizeof(msg), fmt, args);

    {
        std::lock_guard<std::mutex> lock(m_mtx);
        std::printf("[%s][%s] %s\n", ts, levelName(lvl), msg);
        std::fflush(stdout);
#ifdef _WIN32
        if (lvl >= LogLevel::Warn && IsDebuggerPresent()) {
            OutputDebugStringA(msg);
            OutputDebugStringA("\n");
        }
#endif
        if (m_file) {
            std::fprintf(m_file, "[%s][%s] %s\n", ts, levelName(lvl), msg);
            std::fflush(m_file);
        }
    }
}

} // namespace aj
