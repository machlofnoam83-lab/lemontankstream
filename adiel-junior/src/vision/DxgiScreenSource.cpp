// =============================================================================
//  Adiel Junior — DxgiScreenSource (Windows)
//  תפיסת מסך: DXGI Desktop Duplication עם נפילת GDI.
// =============================================================================
#include "vision/DxgiScreenSource.h"

#include <windows.h>

#include "core/Logger.h"

namespace aj {

namespace {

// המרת פורמטים שונים לפיקסל BGRA8
void convertRowToBgra(const uint8_t* src, uint8_t* dst, int width, DXGI_FORMAT fmt) {
    switch (fmt) {
        case DXGI_FORMAT_B8G8R8A8_UNORM:
            std::memcpy(dst, src, static_cast<size_t>(width) * 4);
            break;
        case DXGI_FORMAT_R8G8B8A8_UNORM:
            for (int x = 0; x < width; ++x) {
                dst[x * 4 + 0] = src[x * 4 + 2];
                dst[x * 4 + 1] = src[x * 4 + 1];
                dst[x * 4 + 2] = src[x * 4 + 0];
                dst[x * 4 + 3] = src[x * 4 + 3];
            }
            break;
        case DXGI_FORMAT_R10G10B10A2_UNORM: {
            const uint32_t* p = reinterpret_cast<const uint32_t*>(src);
            for (int x = 0; x < width; ++x) {
                uint32_t v = p[x];
                dst[x * 4 + 0] = static_cast<uint8_t>(((v & 0x3FFu) * 255u) / 1023u);
                dst[x * 4 + 1] = static_cast<uint8_t>((((v >> 10) & 0x3FFu) * 255u) / 1023u);
                dst[x * 4 + 2] = static_cast<uint8_t>((((v >> 20) & 0x3FFu) * 255u) / 1023u);
                dst[x * 4 + 3] = 255;
            }
            break;
        }
        default: // R16G16B16A16_FLOAT ופורמטים לא מוכרים — ממוצע פשוט
            std::memset(dst, 0, static_cast<size_t>(width) * 4);
            break;
    }
}

} // namespace

DxgiScreenSource::DxgiScreenSource(const Config& cfg) : m_cfg(cfg) {}

DxgiScreenSource::~DxgiScreenSource() { stop(); }

bool DxgiScreenSource::start() {
    if (m_running.load()) return true;
    bool ok = initDxgi();
    if (!ok && m_cfg.gdiFallback) {
        logWarn("DXGI: לא זמין — עובר למצב GDI fallback");
        ok = initGdi();
    }
    m_running = ok;
    return ok;
}

void DxgiScreenSource::stop() {
    m_running = false;
    shutdown();
}

// ---------------------------------------------------------------------------
// DXGI Desktop Duplication
// ---------------------------------------------------------------------------
bool DxgiScreenSource::initDxgi() {
    HRESULT hr;

    Microsoft::WRL::ComPtr<IDXGIFactory1> factory;
    hr = CreateDXGIFactory1(IID_PPV_ARGS(&factory));
    if (FAILED(hr)) return false;

    Microsoft::WRL::ComPtr<IDXGIAdapter> adapter;
    if (FAILED(factory->EnumAdapters(0, &adapter))) return false;

    Microsoft::WRL::ComPtr<IDXGIOutput> output;
    if (FAILED(adapter->EnumOutputs(0, &output))) return false;
    m_output = output;

    DXGI_OUTPUT_DESC odesc{};
    output->GetDesc(&odesc);
    m_width  = static_cast<int>(odesc.DesktopCoordinates.right - odesc.DesktopCoordinates.left);
    m_height = static_cast<int>(odesc.DesktopCoordinates.bottom - odesc.DesktopCoordinates.top);
    logInfo("DXGI: מסך %dx%d (%ls)", m_width, m_height, odesc.DeviceName);

    // יצירת D3D11 device על אותו adapter (BGRA_SUPPORT — לשילוב D2D עתידי)
    UINT flags = D3D11_CREATE_DEVICE_BGRA_SUPPORT;
    D3D_FEATURE_LEVEL levels[] = { D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0 };
    hr = D3D11CreateDevice(adapter.Get(), D3D_DRIVER_TYPE_UNKNOWN, nullptr, flags,
                           levels, 2, D7D11_SDK_VERSION,
                           &m_d3d11, nullptr, &m_d3dCtx);
    if (FAILED(hr)) {
        // נסיון בלי feature level 11.1
        hr = D3D11CreateDevice(adapter.Get(), D3D_DRIVER_TYPE_UNKNOWN, nullptr, flags,
                               levels + 1, 1, D7D11_SDK_VERSION,
                               &m_d3d11, nullptr, &m_d3dCtx);
    }
    if (FAILED(hr)) return false;

    Microsoft::WRL::ComPtr<IDXGIOutput1> output1;
    if (FAILED(output->QueryInterface(IID_PPV_ARGS(&output1)))) return false;

    hr = output1->DuplicateOutput(m_d3d11.Get(), &m_dup);
    if (FAILED(hr)) {
        logWarn("DXGI: DuplicateOutput נכשל (0x%08X) — ייתכן חיבור RDP", static_cast<unsigned>(hr));
        return false;
    }
    m_usingGdi = false;
    return true;
}

std::shared_ptr<Frame> DxgiScreenSource::capture(int timeoutMs) {
    if (!m_running.load()) return nullptr;
    if (m_usingGdi) return captureGdi();
    return captureDxgi(timeoutMs);
}

std::shared_ptr<Frame> DxgiScreenSource::captureDxgi(int timeoutMs) {
    std::lock_guard<std::mutex> lock(m_mtx);
    if (!m_dup) return nullptr;

    DXGI_OUTDUPL_FRAME_INFO info{};
    Microsoft::WRL::ComPtr<IDXGIResource> res;
    HRESULT hr = m_dup->AcquireNextFrame(static_cast<UINT>(std::max(1, timeoutMs / 10)), &info, &res);
    if (hr == DXGI_ERROR_WAIT_TIMEOUT) return nullptr;
    if (hr == DXGI_ERROR_ACCESS_LOST || hr == DXGI_ERROR_DEVICE_REMOVED) {
        logWarn("DXGI: אובדן גישה ל-desktop — מאתחל מחדש");
        m_dup.Reset();
        if (initDxgi()) logInfo("DXGI: איתחול מחדש הצליח");
        return nullptr;
    }
    if (FAILED(hr) || !res) { m_dup->ReleaseFrame(); return nullptr; }

    Microsoft::WRL::ComPtr<ID3D11Texture2D> tex;
    if (FAILED(res->QueryInterface(IID_PPV_ARGS(&tex)))) {
        m_dup->ReleaseFrame();
        return nullptr;
    }

    D3D11_TEXTURE2D_DESC desc{};
    tex->GetDesc(&desc);

    // יצירת staging texture (אם הפורמט השתנה — יצירה מחדש)
    if (!m_staging || m_fmt != desc.Format || m_width != static_cast<int>(desc.Width) ||
        m_height != static_cast<int>(desc.Height)) {
        D3D11_TEXTURE2D_DESC st = desc;
        st.Usage = D3D11_USAGE_STAGING;
        st.BindFlags = 0;
        st.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
        st.MiscFlags = 0;
        if (FAILED(m_d3d11->CreateTexture2D(&st, nullptr, &m_staging))) {
            m_dup->ReleaseFrame();
            return nullptr;
        }
        m_fmt = desc.Format;
        m_width = static_cast<int>(desc.Width);
        m_height = static_cast<int>(desc.Height);
    }

    // העתקת GPU → CPU (Zero-Copy מרמת ה-duplication, העתקה אחת בלבד)
    m_d3dCtx->CopyResource(m_staging.Get(), tex.Get());

    auto frame = std::make_shared<Frame>();
    frame->width = m_width;
    frame->height = m_height;
    frame->stride = m_width * 4;
    frame->pixels.resize(static_cast<size_t>(m_width) * m_height * 4);
    frame->timestampMs = static_cast<uint64_t>(GetTickCount64());

    D3D11_MAPPED_SUBRESOURCE mapped{};
    if (SUCCEEDED(m_d3dCtx->Map(m_staging.Get(), 0, D3D11_MAP_READ, 0, &mapped))) {
        const uint8_t* src = static_cast<const uint8_t*>(mapped.pData);
        for (int y = 0; y < m_height; ++y) {
            convertRowToBgra(src + static_cast<size_t>(y) * mapped.RowPitch,
                             frame->row(y), m_width, m_fmt);
        }
        m_d3dCtx->Unmap(m_staging.Get(), 0);
        frame->empty = false;
    }

    m_dup->ReleaseFrame();
    return frame;
}

// ---------------------------------------------------------------------------
// GDI fallback (BitBlt)
// ---------------------------------------------------------------------------
bool DxgiScreenSource::initGdi() {
    HDC screen = GetDC(nullptr);
    if (!screen) return false;
    m_width = GetSystemMetrics(SM_CXSCREEN);
    m_height = GetSystemMetrics(SM_CYSCREEN);
    ReleaseDC(nullptr, screen);
    m_usingGdi = true;
    logInfo("GDI: לכידה פעילה %dx%d", m_width, m_height);
    return m_width > 0 && m_height > 0;
}

std::shared_ptr<Frame> DxgiScreenSource::captureGdi() {
    std::lock_guard<std::mutex> lock(m_mtx);
    HDC screen = GetDC(nullptr);
    if (!screen) return nullptr;

    HDC mem = CreateCompatibleDC(screen);
    BITMAPINFO bi{};
    bi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    bi.bmiHeader.biWidth = m_width;
    bi.bmiHeader.biHeight = -m_height; // top-down
    bi.bmiHeader.biPlanes = 1;
    bi.bmiHeader.biBitCount = 32;
    bi.bmiHeader.biCompression = BI_RGB;

    void* bits = nullptr;
    HBITMAP bmp = CreateDIBSection(mem, &bi, DIB_RGB_COLORS, &bits, nullptr, 0);
    if (!bmp) {
        DeleteDC(mem);
        ReleaseDC(nullptr, screen);
        return nullptr;
    }
    HGDIOBJ old = SelectObject(mem, bmp);
    BitBlt(mem, 0, 0, m_width, m_height, screen, 0, 0, SRCCOPY | CAPTUREBLT);
    SelectObject(mem, old);

    auto frame = std::make_shared<Frame>();
    frame->width = m_width;
    frame->height = m_height;
    frame->stride = m_width * 4;
    frame->pixels.assign(static_cast<size_t>(m_width) * m_height * 4, 0);
    frame->timestampMs = static_cast<uint64_t>(GetTickCount64());
    if (bits) {
        std::memcpy(frame->pixels.data(), bits, frame->pixels.size());
        frame->empty = false;
    }

    DeleteObject(bmp);
    DeleteDC(mem);
    ReleaseDC(nullptr, screen);
    return frame;
}

void DxgiScreenSource::shutdown() {
    std::lock_guard<std::mutex> lock(m_mtx);
    if (m_dup) { m_dup->ReleaseFrame(); m_dup.Reset(); }
    m_staging.Reset();
    m_d3dCtx.Reset();
    m_d3d11.Reset();
    m_output.Reset();
}

// ---------------------------------------------------------------------------
// מפעל
// ---------------------------------------------------------------------------
IScreenSource* createScreenSource(const Config& cfg) {
    return new DxgiScreenSource(cfg);
}

} // namespace aj
