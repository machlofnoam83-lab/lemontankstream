// =============================================================================
//  Adiel Junior — Logger
//  לוגר תרדי-סייפ עבור המנוע כולו (קונסול + קובץ). UTF-8, עברית.
// =============================================================================
#pragma once

#include <cstdarg>
#include <cstdio>
#include <mutex>
#include <string>

namespace aj {

enum class LogLevel { Debug = 0, Info = 1, Warn = 2, Error = 3 };

class Logger {
public:
    static Logger& instance();

    void setMinLevel(LogLevel lvl) { m_minLevel = lvl; }
    void setFileEnabled(bool en) { m_fileEnabled = en; }
    void setFile(const std::string& path);

    void log(LogLevel lvl, const char* fmt, ...) {
        va_list args;
        va_start(args, fmt);
        vlog(lvl, fmt, args);
        va_end(args);
    }
    void vlog(LogLevel lvl, const char* fmt, va_list args);

private:
    static const char* levelName(LogLevel lvl);

    std::mutex     m_mtx;
    LogLevel       m_minLevel = LogLevel::Info;
    bool           m_fileEnabled = false;
    std::string    m_filePath;
    std::FILE*     m_file = nullptr;
};

// פונקציות עזר קצרות
inline void logDebug(const char* fmt, ...) {
    va_list args; va_start(args, fmt);
    Logger::instance().vlog(LogLevel::Debug, fmt, args); va_end(args);
}
inline void logInfo(const char* fmt, ...) {
    va_list args; va_start(args, fmt);
    Logger::instance().vlog(LogLevel::Info, fmt, args); va_end(args);
}
inline void logWarn(const char* fmt, ...) {
    va_list args; va_start(args, fmt);
    Logger::instance().vlog(LogLevel::Warn, fmt, args); va_end(args);
}
inline void logError(const char* fmt, ...) {
    va_list args; va_start(args, fmt);
    Logger::instance().vlog(LogLevel::Error, fmt, args); va_end(args);
}

} // namespace aj
