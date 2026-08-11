#include "vision/ScreenContext.h"

#include "core/Logger.h"

#ifdef _WIN32
#include <windows.h>

#include <string>

#ifdef ADIEL_HAVE_OCR
#if __has_include(<winrt/Windows.Media.Ocr.h>)
#define AJ_HAS_WINRT_OCR 1
#include <winrt/Windows.Globalization.h>
#include <winrt/Windows.Graphics.Imaging.h>
#include <winrt/Windows.Media.Ocr.h>
#include <winrt/Windows.Storage.Streams.h>
#pragma comment(lib, "windowsapp.lib")
#pragma comment(lib, "runtimeobject.lib")
#endif
#endif
#endif // _WIN32

namespace aj {

#ifdef _WIN32
namespace {

// UTF-16 → UTF-8
std::string utf16to8(const std::wstring& w) {
    if (w.empty()) return {};
    int n = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), static_cast<int>(w.size()),
                                nullptr, 0, nullptr, nullptr);
    std::string out(static_cast<size_t>(n), '\0');
    WideCharToMultiByte(CP_UTF8, 0, w.c_str(), static_cast<int>(w.size()),
                        out.data(), n, nullptr, nullptr);
    return out;
}

} // namespace
#endif

ScreenContext::ScreenContext(const Config& cfg) : m_ocrEnabled(cfg.ocrEnabled) {
    logInfo("ScreenContext: OCR %s", ocrAvailable() ? "זמין" : "לא זמין");
}

bool ScreenContext::ocrAvailable() {
#ifdef AJ_HAS_WINRT_OCR
    return true;
#else
    return false;
#endif
}

std::string ScreenContext::activeWindowTitle() {
#ifdef _WIN32
    HWND hwnd = GetForegroundWindow();
    if (!hwnd) return {};
    wchar_t buf[512] = {0};
    int n = GetWindowTextW(hwnd, buf, 511);
    if (n <= 0) return {};
    return utf16to8(buf);
#else
    return {};
#endif
}

std::string ScreenContext::activeProcessName() {
#ifdef _WIN32
    HWND hwnd = GetForegroundWindow();
    if (!hwnd) return {};
    DWORD pid = 0;
    GetWindowThreadProcessId(hwnd, &pid);
    if (!pid) return {};
    HANDLE h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (!h) return {};
    wchar_t buf[MAX_PATH] = {0};
    DWORD sz = MAX_PATH;
    std::string name;
    if (QueryFullProcessImageNameW(h, 0, buf, &sz)) {
        std::wstring full = buf;
        auto pos = full.find_last_of(L'\\');
        name = utf16to8(pos == std::wstring::npos ? full : full.substr(pos + 1));
    }
    CloseHandle(h);
    return name;
#else
    return {};
#endif
}

std::string ScreenContext::ocrRegion(const Frame& frame, int x, int y, int w, int h) {
#ifdef AJ_HAS_WINRT_OCR
    if (!m_ocrEnabled || frame.empty) return {};
    if (w <= 0 || h <= 0) { x = 0; y = 0; w = frame.width; h = frame.height; }
    x = std::max(0, x); y = std::max(0, y);
    w = std::min(w, frame.width - x);
    h = std::min(h, frame.height - y);
    if (w <= 0 || h <= 0) return {};

    try {
        // בחירת שפת OCR: עברית ראשית, אחרת שפת המשתמש
        winrt::Windows::Media::Ocr::OcrEngine engine =
            winrt::Windows::Media::Ocr::OcrEngine::TryCreateFromLanguage(
                winrt::Windows::Globalization::Language{L"he"});
        if (!engine) {
            engine = winrt::Windows::Media::Ocr::OcrEngine::TryCreateFromUserProfileLanguages();
        }
        if (!engine) return {};

        // העתקת אזור ה-ROI לפיקסלים BGRA8 → SoftwareBitmap
        const size_t bytes = static_cast<size_t>(w) * h * 4;
        winrt::Windows::Storage::Streams::Buffer buf(static_cast<uint32_t>(bytes));
        {
            auto byteAccess = buf.as<::Windows::Storage::Streams::IBufferByteAccess>();
            uint8_t* dst = nullptr;
            byteAccess->Buffer(&dst);
            for (int yy = 0; yy < h; ++yy) {
                std::memcpy(dst + static_cast<size_t>(yy) * w * 4,
                            frame.row(y + yy) + static_cast<size_t>(x) * 4,
                            static_cast<size_t>(w) * 4);
            }
        }
        auto bmp = winrt::Windows::Graphics::Imaging::SoftwareBitmap::CreateCopyFromBuffer(
            buf, winrt::Windows::Graphics::Imaging::BitmapPixelFormat::Bgra8,
            w, h);

        auto result = engine.RecognizeAsync(bmp).get();
        std::string text;
        for (auto const& line : result.Lines()) {
            std::wstring ws = line.Text();
            text += utf16to8(ws) + "\n";
        }
        return text;
    } catch (...) {
        logWarn("OCR: כשל בזיהוי");
        return {};
    }
#else
    (void)frame; (void)x; (void)y; (void)w; (void)h;
    return {};
#endif
}

ScreenSnapshot ScreenContext::build(const std::shared_ptr<Frame>& frame,
                                    bool doOcr,
                                    int regionX, int regionY,
                                    int regionW, int regionH) {
    ScreenSnapshot snap;
    snap.windowTitle = activeWindowTitle();
    snap.processName = activeProcessName();
    if (frame) {
        snap.width = frame->width;
        snap.height = frame->height;
    }
    if (doOcr) {
        snap.ocrText = ocrRegion(*frame, regionX, regionY, regionW, regionH);
    }
    return snap;
}

} // namespace aj
