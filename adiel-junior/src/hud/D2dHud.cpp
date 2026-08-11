// =============================================================================
//  Adiel Junior — D2dHud (Windows)
//  ממשק הולוגרפי: D2D1.3 + D3D12(11on12) + DirectComposition + DirectWrite.
// =============================================================================
#include "hud/D2dHud.h"
#include "hud/HudNull.h"

#ifdef _WIN32

#include <algorithm>
#include <cmath>
#include <cstring>
#include <mmsystem.h>
#include <windowsx.h>

#include "core/Logger.h"

#pragma comment(lib, "d2d1.lib")
#pragma comment(lib, "dwrite.lib")
#pragma comment(lib, "winmm.lib")
#pragma comment(lib, "dcomp.lib")
#pragma comment(lib, "d3d11.lib")
#pragma comment(lib, "d3d12.lib")
#pragma comment(lib, "dxgi.lib")
#pragma comment(lib, "ole32.lib")

namespace aj {

namespace {
constexpr wchar_t kWindowClass[] = L"AdielJuniorHudWindow";

D2D1_COLOR_F rgb(float r, float g, float b, float a = 1.0f) {
    return D2D1::ColorF(r, g, b, a);
}

std::wstring utf8to16(const std::string& s) {
    if (s.empty()) return {};
    int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), static_cast<int>(s.size()), nullptr, 0);
    std::wstring out(static_cast<size_t>(n), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, s.c_str(), static_cast<int>(s.size()), out.data(), n);
    return out;
}
} // namespace

// ---------------------------------------------------------------------------
//  בנייה
// ---------------------------------------------------------------------------
D2dHud::D2dHud() = default;
D2dHud::~D2dHud() = default;

bool D2dHud::init(const Config& cfg, ActionCallback onAction) {
    m_onAction = std::move(onAction);
    m_panelW = cfg.hudWidth;
    m_panelH = cfg.hudHeight;
    m_opacity = cfg.hudOpacity;
    m_fontName = cfg.hudFont.empty() ? "Segoe UI" : cfg.hudFont;

    if (!createWindow()) {
        logError("HUD: כשל ביצירת חלון");
        return false;
    }
    if (!createDevice()) {
        logError("HUD: כשל ביצירת התקן גרפי");
        return false;
    }
    if (!createD2D() || !createDComp() || !createResources()) {
        logError("HUD: כשל ביצירת משאבי רינדור");
        return false;
    }

    m_startTick = GetTickCount64();
    logInfo("HUD: מוכן (%s) — %dx%d, dpi=%.0f",
            m_d3d12Active ? "Direct3D 12 (11on12)" : "Direct3D 11",
            m_winW, m_winH, static_cast<double>(m_dpi));
    return true;
}

bool D2dHud::createWindow() {
    HINSTANCE hInst = GetModuleHandle(nullptr);

    WNDCLASSEX wc{};
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = &D2dHud::wndProcThunk;
    wc.hInstance = hInst;
    wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
    wc.lpszClassName = kWindowClass;
    wc.hIcon = LoadIcon(hInst, MAKEINTRESOURCE(1)); // האייקון מה-version.rc
    if (!RegisterClassEx(&wc)) {
        // כבר רשום (איתחול מחדש)
    }

    RECT work{};
    SystemParametersInfo(SPI_GETWORKAREA, 0, &work, 0);
    m_winW = work.right - work.left;
    m_winH = work.bottom - work.top;

    m_hwnd = CreateWindowEx(
        WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
        kWindowClass, L"Adiel Junior HUD",
        WS_POPUP,
        work.left, work.top, m_winW, m_winH,
        nullptr, nullptr, hInst, this);
    if (!m_hwnd) return false;

    ShowWindow(m_hwnd, SW_SHOWNOACTIVATE);
    m_dpi = static_cast<float>(GetDpiForWindow(m_hwnd));
    if (m_dpi <= 0) m_dpi = 96.0f;
    return true;
}

bool D2dHud::createDevice() {
    HRESULT hr = S_OK;

#ifdef ADIEL_HUD_D3D12
    // ---- ניסיון: Direct3D 12 + 11on12 (רינדור D2D על מנוע D3D12)
    hr = D3D12CreateDevice(nullptr, D3D_FEATURE_LEVEL_11_0, IID_PPV_ARGS(&m_d3d12));
    if (SUCCEEDED(hr)) {
        D3D12_COMMAND_QUEUE_DESC qdesc{};
        qdesc.Type = D3D12_COMMAND_LIST_TYPE_DIRECT;
        qdesc.Priority = D3D12_COMMAND_QUEUE_PRIORITY_NORMAL;
        qdesc.Flags = D3D12_COMMAND_QUEUE_FLAG_NONE;
        qdesc.NodeMask = 0;
        if (SUCCEEDED(m_d3d12->CreateCommandQueue(&qdesc, IID_PPV_ARGS(&m_d3d12Queue)))) {
            IUnknown* queues[] = { m_d3d12Queue.Get() };
            hr = D3D11On12CreateDevice(m_d3d12.Get(), D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                                       nullptr, 0, queues, 1, 0,
                                       &m_d3d11, nullptr, nullptr);
            if (SUCCEEDED(hr)) {
                m_d3d12Active = true;
                logInfo("HUD: D3D12 פעיל (11on12)");
                return true;
            }
            m_d3d12Queue.Reset();
        }
        m_d3d12.Reset();
    }
#endif

    // ---- נפילה: Direct3D 11
    hr = D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr,
                           D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                           nullptr, 0, D3D11_SDK_VERSION, &m_d3d11, nullptr, nullptr);
    if (FAILED(hr)) {
        hr = D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_WARP, nullptr,
                               D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                               nullptr, 0, D3D11_SDK_VERSION, &m_d3d11, nullptr, nullptr);
    }
    return SUCCEEDED(hr);
}

bool D2dHud::createD2D() {
    Microsoft::WRL::ComPtr<IDXGIDevice> dxgiDevice;
    if (FAILED(m_d3d11.As(&dxgiDevice))) return false;

    D2D1_FACTORY_OPTIONS opts{};
    opts.debugLevel = D2D1_DEBUG_LEVEL_NONE;
    HRESULT hr = D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED,
                                   IID_ID2D1Factory1, &opts,
                                   reinterpret_cast<void**>(m_d2dFactory.GetAddressOf()));
    if (FAILED(hr)) return false;
    if (FAILED(m_d2dFactory->CreateDevice(dxgiDevice.Get(), &m_d2dDevice))) return false;
    if (FAILED(m_d2dDevice->CreateDeviceContext(D2D1_DEVICE_CONTEXT_OPTIONS_NONE,
                                                &m_d2dCtx))) return false;

    hr = DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED, __uuidof(IDWriteFactory),
                             reinterpret_cast<IUnknown**>(m_dwFactory.GetAddressOf()));
    return SUCCEEDED(hr);
}

bool D2dHud::createDComp() {
    Microsoft::WRL::ComPtr<IDXGIDevice> dxgiDevice;
    if (FAILED(m_d3d11.As(&dxgiDevice))) return false;

    HRESULT hr = DCompositionCreateDevice2(dxgiDevice.Get(), IID_PPV_ARGS(&m_dcomp));
    if (FAILED(hr)) return false;
    if (FAILED(m_dcomp->CreateTargetForHwnd(m_hwnd, TRUE, &m_dcompTarget))) return false;
    if (FAILED(m_dcomp->CreateVisual(&m_dcompVisual))) return false;
    m_dcompTarget->SetRoot(m_dcompVisual.Get());
    return true;
}

bool D2dHud::createResources() {
    HRESULT hr = m_d2dCtx->CreateSolidColorBrush(rgb(0.0f, 0.9f, 1.0f), &m_brushState);
    if (FAILED(hr)) return false;
    m_d2dCtx->CreateSolidColorBrush(rgb(1.0f, 1.0f, 1.0f, 0.85f), &m_brushBright);
    m_d2dCtx->CreateSolidColorBrush(rgb(0.6f, 0.75f, 0.85f, 0.55f), &m_brushDim);

    // זוהר (glow) — radial gradient
    D2D1_GRADIENT_STOP stops[2] = {
        { 0.0f, rgb(0.0f, 0.9f, 1.0f, 0.30f) },
        { 1.0f, rgb(0.0f, 0.9f, 1.0f, 0.0f)  },
    };
    Microsoft::WRL::ComPtr<ID2D1GradientStopCollection> glowCol;
    if (FAILED(m_d2dCtx->CreateGradientStopCollection(stops, 2, D2D1_GAMMA_2_2,
                                                      D2D1_EXTEND_MODE_CLAMP, &glowCol)))
        return false;
    m_d2dCtx->CreateRadialGradientBrush(
        D2D1::RadialGradientBrushProperties(D2D1::Point2F(0, 0), D2D1::Point2F(0, 0), 150, 150),
        glowCol.Get(), &m_brushGlow);

    // פאנל — לינארי כהה שקוף
    D2D1_GRADIENT_STOP pStops[2] = {
        { 0.0f, rgb(0.03f, 0.07f, 0.12f, 0.88f) },
        { 1.0f, rgb(0.01f, 0.02f, 0.05f, 0.94f) },
    };
    Microsoft::WRL::ComPtr<ID2D1GradientStopCollection> panelCol;
    if (FAILED(m_d2dCtx->CreateGradientStopCollection(pStops, 2, D2D1_GAMMA_2_2,
                                                      D2D1_EXTEND_MODE_CLAMP, &panelCol)))
        return false;
    m_d2dCtx->CreateLinearGradientBrush(
        D2D1::LinearGradientBrushProperties(D2D1::Point2F(0, 0), D2D1::Point2F(0, 400)),
        panelCol.Get(), &m_brushPanel);

    // סגנון קו מקווקו (לטבעת המסתובבת)
    D2D1_STROKE_STYLE_PROPERTIES dashProps = D2D1::StrokeStyleProperties(
        D2D1_CAP_STYLE_ROUND, D2D1_CAP_STYLE_ROUND, D2D1_CAP_STYLE_ROUND,
        D2D1_LINE_JOIN_MITER, 10.0f, D2D1_DASH_STYLE_DASH, 0.0f);
    m_d2dFactory->CreateStrokeStyle(dashProps, nullptr, 0, &m_dashStroke);

    // גיאומטריית קשת (לטבעת המסתובבת)
    m_d2dFactory->CreatePathGeometry(&m_arcGeom);
    if (m_arcGeom) {
        Microsoft::WRL::ComPtr<ID2D1GeometrySink> sink;
        if (SUCCEEDED(m_arcGeom->Open(&sink))) {
            sink->SetFillMode(D2D1_FILL_MODE_ALTERNATE);
            sink->BeginFigure(D2D1::Point2F(1.0f, 0.0f), D2D1_FIGURE_BEGIN_HOLLOW);
            sink->AddArc(D2D1::ArcSegment(D2D1::Point2F(
                                               static_cast<float>(std::cos(300.0 * 3.14159265 / 180.0)),
                                               static_cast<float>(std::sin(300.0 * 3.14159265 / 180.0))),
                                          D2D1::SizeF(1.0f, 1.0f), 0.0f,
                                          D2D1_SWEEP_DIRECTION_CLOCKWISE, D2D1_ARC_SIZE_LARGE));
            sink->EndFigure(D2D1_FIGURE_END_OPEN);
            sink->Close();
        }
    }

    // פורמטי טקסט (עברית, RTL)
    auto makeFormat = [&](float size, IDWriteTextFormat** out) -> bool {
        HRESULT h = m_dwFactory->CreateTextFormat(utf8to16(m_fontName).c_str(), nullptr,
                                                  DWRITE_FONT_WEIGHT_NORMAL,
                                                  DWRITE_FONT_STYLE_NORMAL,
                                                  DWRITE_FONT_STRETCH_NORMAL,
                                                  size * m_dpi / 96.0f, L"he-IL", out);
        if (FAILED(h)) return false;
        (*out)->SetTextAlignment(DWRITE_TEXT_ALIGNMENT_LEADING);
        (*out)->SetParagraphAlignment(DWRITE_PARAGRAPH_ALIGNMENT_CENTER);
        (*out)->SetReadingDirection(DWRITE_READING_DIRECTION_RIGHT_TO_LEFT);
        (*out)->SetFlowDirection(DWRITE_FLOW_DIRECTION_TOP_TO_BOTTOM);
        return true;
    };
    if (!makeFormat(26, m_fmtTitle.GetAddressOf())) return false;
    if (!makeFormat(19, m_fmtStatus.GetAddressOf())) return false;
    if (!makeFormat(14, m_fmtTokens.GetAddressOf())) return false;
    if (!makeFormat(12, m_fmtSmall.GetAddressOf())) return false;

    return true;
}

// ---------------------------------------------------------------------------
//  צבע לפי מצב
// ---------------------------------------------------------------------------
D2D1_COLOR_F D2dHud::stateColor() const {
    const std::string st = m_model.getState();
    if (st == "listening")  return rgb(0.0f, 1.0f, 0.62f);   // ירוק — מקשיב
    if (st == "processing") return rgb(0.2f, 0.7f, 1.0f);    // כחול — מעבד קול
    if (st == "thinking")   return rgb(1.0f, 0.77f, 0.0f);   // ענבר — חושב
    if (st == "speaking")   return rgb(1.0f, 0.24f, 0.94f);  // מג'נטה — מדבר
    if (st == "error")      return rgb(1.0f, 0.32f, 0.32f);  // אדום
    return rgb(0.0f, 0.9f, 1.0f);                            // ציאן — סרק
}

D2D1_RECT_F D2dHud::panelRect() const {
    const std::string mode = m_model.getMode();
    const float s = m_dpi / 96.0f;
    const float w = static_cast<float>(m_panelW) * s;
    const float h = static_cast<float>(m_panelH) * s;
    float x = (static_cast<float>(m_winW) - w) / 2.0f;
    float y = (static_cast<float>(m_winH) - h) / 2.0f;
    if (mode == "docked") {
        x = static_cast<float>(m_winW) - w - 24.0f * s;
        y = (static_cast<float>(m_winH) - h) / 2.0f;
    }
    if (mode == "hidden") {
        x = static_cast<float>(m_winW) + 100.0f; // מחוץ למסך
    }
    x += static_cast<float>(m_dragOffset.x);
    y += static_cast<float>(m_dragOffset.y);
    return D2D1::RectF(x, y, x + w, y + h);
}

// ---------------------------------------------------------------------------
//  רינדור
// ---------------------------------------------------------------------------
void D2dHud::renderFrame() {
    if (!m_d2dCtx || !m_dcomp) return;

    const std::string mode = m_model.getMode();

    // הצגה/הסתרה לפי מצב
    static std::string lastMode = "__none__";
    if (mode != lastMode) {
        lastMode = mode;
        ShowWindow(m_hwnd, mode == "hidden" ? SW_HIDE : SW_SHOWNOACTIVATE);
        if (mode != "hidden") m_dragOffset = {0, 0};
    }
    if (mode == "hidden") return;

    RECT rc{ 0, 0, m_winW, m_winH };
    Microsoft::WRL::ComPtr<IDXGISurface> dxgiSurface;
    POINT offset{};
    HRESULT hr = S_OK;
    if (!m_surface) {
        // יצירת משטח קומפוזיציה חד-פעמית (בגודל החלון)
        hr = m_dcomp->CreateSurface(static_cast<UINT>(m_winW), static_cast<UINT>(m_winH),
                                    DXGI_FORMAT_B8G8R8A8_UNORM,
                                    DXGI_ALPHA_MODE_PREMULTIPLIED, &m_surface);
        if (FAILED(hr)) return;
    }
    hr = m_surface->BeginDraw(&rc, IID_PPV_ARGS(&dxgiSurface), &offset);
    if (FAILED(hr)) return;

    Microsoft::WRL::ComPtr<ID2D1Bitmap1> target;
    D2D1_BITMAP_PROPERTIES1 props = D2D1::BitmapProperties1(
        D2D1_BITMAP_OPTIONS_TARGET,
        D2D1::PixelFormat(DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_PREMULTIPLIED),
        m_dpi, m_dpi);
    if (FAILED(m_d2dCtx->CreateBitmapFromDxgiSurface(dxgiSurface.Get(), &props, &target))) {
        m_surface->EndDraw();
        return;
    }

    m_d2dCtx->SetTarget(target.Get());
    m_d2dCtx->BeginDraw();
    m_d2dCtx->Clear(D2D1::ColorF(0, 0, 0, 0));

    const double t = static_cast<double>(GetTickCount64() - m_startTick) / 1000.0;
    const float s = m_dpi / 96.0f;

    // ---- פאנל ראשי
    const D2D1_RECT_F panel = panelRect();
    const bool docked = (mode == "docked");
    const float radius = 14.0f * s;
    D2D1_ROUNDED_RECT rr{ panel, radius, radius };
    m_d2dCtx->FillRoundedRectangle(&rr, m_brushPanel.Get());
    m_d2dCtx->DrawRoundedRectangle(&rr, m_brushState.Get(), 1.5f * s);

    // ---- טבעת אנרגיה (Arc Reactor)
    const float reactorR = (docked ? 40.0f : 88.0f) * s;
    const D2D1_POINT_2F reactorCenter = docked
        ? D2D1::Point2F(panel.left + 70.0f * s, panel.top + 70.0f * s)
        : D2D1::Point2F((panel.left + panel.right) / 2.0f, panel.top + 96.0f * s);
    renderReactor(m_d2dCtx.Get(), reactorCenter, reactorR, t);

    // ---- טקסטים
    const float tx = panel.left + (docked ? 150.0f : 30.0f) * s;
    const float ty = panel.top + (docked ? 24.0f : 190.0f) * s;
    const float tw = panel.right - tx - 24.0f * s;

    renderText(m_d2dCtx.Get(), D2D1::RectF(tx, ty, tx + tw, ty + 44.0f * s),
               L"אדיאל ג'וניור", 26.0f, m_brushBright.Get());
    renderText(m_d2dCtx.Get(), D2D1::RectF(tx, ty + 44.0f * s, tx + tw, ty + 74.0f * s),
               utf8to16(m_model.getStatus()), 19.0f, m_brushState.Get());

    if (!docked) {
        // פקודת המשתמש האחרונה
        if (!m_model.getUserText().empty()) {
            std::wstring user = L"אתה: " + utf8to16(m_model.getUserText());
            renderText(m_d2dCtx.Get(), D2D1::RectF(tx, ty + 80.0f * s, tx + tw, ty + 106.0f * s),
                       user, 14.0f, m_brushDim.Get());
        }
        // תשובה סטרימינג
        const std::wstring tokens = utf8to16(m_model.getTokens());
        if (!tokens.empty()) {
            Microsoft::WRL::ComPtr<IDWriteTextLayout> layout;
            if (SUCCEEDED(m_dwFactory->CreateTextLayout(tokens.c_str(), static_cast<UINT32>(tokens.size()),
                                                        m_fmtTokens.Get(), tw, 130.0f * s,
                                                        &layout))) {
                m_d2dCtx->DrawTextLayout(D2D1::Point2F(tx, ty + 112.0f * s), layout.Get(),
                                         m_brushBright.Get(), D2D1_DRAW_TEXT_OPTIONS_CLIP);
            }
        }
    }

    // ---- גל קול (FFT)
    const D2D1_RECT_F waveArea = docked
        ? D2D1::RectF(panel.left + 12.0f * s, panel.bottom - 52.0f * s,
                      panel.right - 12.0f * s, panel.bottom - 14.0f * s)
        : D2D1::RectF(panel.left + 24.0f * s, panel.bottom - 64.0f * s,
                      panel.right - 24.0f * s, panel.bottom - 20.0f * s);
    renderWaveform(m_d2dCtx.Get(), waveArea, t);

    // ---- כפתורים (פינה ימין עליונה)
    const float bw = 26.0f * s;
    const float by = panel.top + 14.0f * s;
    const float bx0 = panel.right - 14.0f * s - bw;
    m_btnClose  = D2D1::RectF(bx0 - 3.0f * bw, by, bx0 - 2.0f * bw, by + bw);
    m_btnHide   = D2D1::RectF(bx0 - 2.0f * bw, by, bx0 - 1.0f * bw, by + bw);
    m_btnDock   = D2D1::RectF(bx0 - 1.0f * bw, by, bx0, by + bw);
    m_btnCenter = D2D1::RectF(bx0, by, bx0 + bw, by + bw);

    auto drawBtn = [&](const D2D1_RECT_F& b, const wchar_t* glyph) {
        m_d2dCtx->DrawRoundedRectangle(D2D1::RoundedRect(b, 6.0f * s, 6.0f * s),
                                       m_brushDim.Get(), 1.0f * s);
        renderText(m_d2dCtx.Get(), b, glyph, 13.0f, m_brushBright.Get());
    };
    drawBtn(m_btnClose, L"✕");
    drawBtn(m_btnHide, L"—");
    drawBtn(m_btnDock, L"▸");
    drawBtn(m_btnCenter, L"◎");

    // ---- שם מנוע + שעון (שורה תחתונה)
    std::wstring footer = utf8to16(m_model.getEngineName());
    if (footer.empty()) footer = L"Adiel Junior Engine v1.0";
    renderText(m_d2dCtx.Get(), D2D1::RectF(panel.left + 16.0f * s, panel.bottom - 26.0f * s,
                                           panel.right - 16.0f * s, panel.bottom - 6.0f * s),
               footer, 11.0f, m_brushDim.Get());

    hr = m_d2dCtx->EndDraw();
    m_d2dCtx->SetTarget(nullptr);

    m_surface->EndDraw();
    m_dcompVisual->SetContent(m_surface.Get());
    m_dcomp->Commit();
    (void)hr;
}

void D2dHud::renderReactor(ID2D1DeviceContext* ctx, D2D1_POINT_2F c, float r, double t) {
    const float s = m_dpi / 96.0f;
    const float energy = std::clamp(m_model.getEnergy(), 0.0f, 1.0f);
    const float pulse = 1.0f + 0.05f * static_cast<float>(std::sin(t * 2.0 * 3.14159265 * 1.3)) +
                        0.10f * energy;
    const float R = r * pulse;

    // זוהר חיצוני
    m_brushGlow->SetCenter(D2D1::Point2F(c.x, c.y));
    m_brushGlow->SetRadiusX(R * 1.7f);
    m_brushGlow->SetRadiusY(R * 1.7f);
    ctx->FillEllipse(D2D1::Ellipse(c, R * 1.7f, R * 1.7f), m_brushGlow.Get());

    // ליבה כהה
    ctx->FillEllipse(D2D1::Ellipse(c, R * 0.42f, R * 0.42f),
                     m_brushPanel.Get());

    // טבעת ראשית
    ctx->DrawEllipse(D2D1::Ellipse(c, R, R), m_brushState.Get(), 2.2f);

    // טבעת מקווקוות מסתובבת (גיאומטריית קשת יחידה + טרנספורמציה)
    if (m_arcGeom && m_dashStroke) {
        // קשת היחידה (r=1 במרכז 0,0) → סיבוב + קנה מידה + הזזה למרכז
        ctx->SetTransform(D2D1::Matrix3x2F::Translation(c.x, c.y) *
                          D2D1::Matrix3x2F::Scale(R, R) *
                          D2D1::Matrix3x2F::Rotation(
                              static_cast<float>(std::fmod(t * 55.0, 360.0))));
        ctx->DrawGeometry(m_arcGeom.Get(), m_brushState.Get(), 2.2f * s,
                          m_dashStroke.Get());
        ctx->SetTransform(D2D1::Matrix3x2F::Identity());
    }
    // טבעת פנימית עדינה
    ctx->DrawEllipse(D2D1::Ellipse(c, R * 0.82f, R * 0.82f), m_brushDim.Get(), 1.2f * s);

    // 12 נקודות מסתובבות
    for (int i = 0; i < 12; ++i) {
        double a = t * 1.4 + static_cast<double>(i) * 3.14159265 * 2.0 / 12.0;
        D2D1_POINT_2F p{ c.x + static_cast<float>(std::cos(a)) * R * 0.72f,
                         c.y + static_cast<float>(std::sin(a)) * R * 0.72f };
        ctx->FillEllipse(D2D1::Ellipse(p, 2.2f, 2.2f), m_brushState.Get());
    }

    // טקסט במרכז הליבה
    const std::string state = m_model.getState();
    const wchar_t* glyph = L"●";
    if (state == "listening") glyph = L"◉";
    if (state == "thinking")  glyph = L"◔";
    if (state == "speaking")  glyph = L"◐";
    renderText(ctx, D2D1::RectF(c.x - R * 0.4f, c.y - R * 0.35f, c.x + R * 0.4f, c.y + R * 0.4f),
               glyph, 18.0f, m_brushState.Get());
}

void D2dHud::renderWaveform(ID2D1DeviceContext* ctx, D2D1_RECT_F area, double t) {
    constexpr int kBarCount = 48;
    const float gap = 2.0f;
    const float w = (area.right - area.left - gap * static_cast<float>(kBarCount - 1)) /
                    static_cast<float>(kBarCount);
    const float h = area.bottom - area.top;

    std::vector<float> bins = m_model.getBins();
    if (bins.size() < static_cast<size_t>(kBarCount)) {
        // סינתטי: גל עדין כשהמיקרופון שקט
        bins.assign(static_cast<size_t>(kBarCount), 0.0f);
        for (int i = 0; i < kBarCount; ++i) {
            bins[static_cast<size_t>(i)] = 0.06f + 0.05f *
                static_cast<float>(std::sin(t * 2.2 + i * 0.45));
        }
    }

    for (int i = 0; i < kBarCount; ++i) {
        float v = bins[static_cast<size_t>(i) * bins.size() / kBarCount];
        v = std::clamp(v, 0.02f, 1.0f);
        float bh = std::max(3.0f, v * h);
        float x = area.left + static_cast<float>(i) * (w + gap);
        float y = area.bottom - bh;
        D2D1_RECT_F bar{ x, y, x + w, y + bh };
        // הדרגת צבע: בר גבוה = בהיר
        if (i % 4 == 0) ctx->FillRectangle(bar, m_brushBright.Get());
        else ctx->FillRectangle(bar, m_brushState.Get());
    }
}

void D2dHud::renderText(ID2D1DeviceContext* ctx, D2D1_RECT_F area, const std::wstring& text,
                        float size, ID2D1Brush* brush) {
    if (text.empty() || area.right <= area.left || area.bottom <= area.top) return;
    IDWriteTextFormat* fmt = nullptr;
    if (size >= 25.0f) fmt = m_fmtTitle.Get();
    else if (size >= 17.0f) fmt = m_fmtStatus.Get();
    else if (size >= 13.0f) fmt = m_fmtTokens.Get();
    else fmt = m_fmtSmall.Get();

    Microsoft::WRL::ComPtr<IDWriteTextLayout> layout;
    if (SUCCEEDED(m_dwFactory->CreateTextLayout(text.c_str(), static_cast<UINT32>(text.size()),
                                                fmt, area.right - area.left, area.bottom - area.top,
                                                &layout))) {
        ctx->DrawTextLayout(D2D1::Point2F(area.left, area.top), layout.Get(), brush,
                            D2D1_DRAW_TEXT_OPTIONS_CLIP);
    }
}

// ---------------------------------------------------------------------------
//  לולאת הודעות
// ---------------------------------------------------------------------------
void D2dHud::run() {
    timeBeginPeriod(1);
    MSG msg{};
    while (!m_exit.load()) {
        while (PeekMessage(&msg, nullptr, 0, 0, PM_REMOVE)) {
            if (msg.message == WM_QUIT) { m_exit = true; break; }
            TranslateMessage(&msg);
            DispatchMessage(&msg);
        }
        if (!m_exit.load()) {
            renderFrame();
            Sleep(16); // ~60fps
        }
    }
    timeEndPeriod(1);
    m_model.setRunning(false);
}

void D2dHud::requestExit() {
    if (m_hwnd) PostMessage(m_hwnd, WM_CLOSE, 0, 0);
}

// ---------------------------------------------------------------------------
//  חלון
// ---------------------------------------------------------------------------
LRESULT CALLBACK D2dHud::wndProcThunk(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    D2dHud* self = nullptr;
    if (msg == WM_NCCREATE) {
        auto* cs = reinterpret_cast<CREATESTRUCT*>(lParam);
        self = static_cast<D2dHud*>(cs->lpCreateParams);
        SetWindowLongPtr(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(self));
    } else {
        self = reinterpret_cast<D2dHud*>(GetWindowLongPtr(hwnd, GWLP_USERDATA));
    }
    if (self) return self->wndProc(hwnd, msg, wParam, lParam);
    return DefWindowProc(hwnd, msg, wParam, lParam);
}

LRESULT D2dHud::wndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    switch (msg) {
        case WM_CLOSE:
            m_exit = true;
            DestroyWindow(hwnd);
            return 0;
        case WM_DESTROY:
            PostQuitMessage(0);
            return 0;

        // click-through: רק הכפתורים והלוח מקבלים עכבר
        case WM_NCHITTEST: {
            POINT pt{ GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam) };
            ScreenToClient(hwnd, &pt);
            const D2D1_RECT_F panel = panelRect();
            auto inside = [&](const D2D1_RECT_F& r, float x, float y) {
                return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
            };
            const float x = static_cast<float>(pt.x);
            const float y = static_cast<float>(pt.y);
            if (inside(panel, x, y)) {
                if (inside(m_btnClose, x, y) || inside(m_btnHide, x, y) ||
                    inside(m_btnDock, x, y) || inside(m_btnCenter, x, y))
                    return HTCLIENT;
                return HTCLIENT; // גרירה
            }
            return HTTRANSPARENT;
        }

        case WM_LBUTTONDOWN: {
            POINT pt{ GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam) };
            const D2D1_RECT_F panel = panelRect();
            m_dragStartCursor = { static_cast<float>(pt.x), static_cast<float>(pt.y) };
            m_dragStartOffset = { static_cast<float>(m_dragOffset.x), static_cast<float>(m_dragOffset.y) };
            m_dragging = true;
            SetCapture(hwnd);
            return 0;
        }
        case WM_MOUSEMOVE: {
            if (m_dragging && (wParam & MK_LBUTTON)) {
                POINT pt{ GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam) };
                // הזזה לפי הפרש העכבר מתחילת הגרירה
                m_dragOffset.x = static_cast<LONG>(m_dragStartOffset.x + pt.x - m_dragStartCursor.x);
                m_dragOffset.y = static_cast<LONG>(m_dragStartOffset.y + pt.y - m_dragStartCursor.y);
            }
            return 0;
        }
        case WM_LBUTTONUP: {
            m_dragging = false;
            ReleaseCapture();
            POINT pt{ GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam) };
            auto inside = [&](const D2D1_RECT_F& r, float x, float y) {
                return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
            };
            const float x = static_cast<float>(pt.x);
            const float y = static_cast<float>(pt.y);
            if (m_onAction) {
                if (inside(m_btnClose, x, y))   m_onAction(HudAction::Close);
                else if (inside(m_btnHide, x, y))  m_onAction(HudAction::Hide);
                else if (inside(m_btnDock, x, y))  m_onAction(HudAction::Dock);
                else if (inside(m_btnCenter, x, y)) m_onAction(HudAction::Center);
                else m_onAction(HudAction::ListenToggle);
            }
            return 0;
        }
    }
    return DefWindowProc(hwnd, msg, wParam, lParam);
}

} // namespace aj

#endif // _WIN32

// ---------------------------------------------------------------------------
// מפעל: HUD מלא עם נפילה ל-headless
// ---------------------------------------------------------------------------
namespace aj {
IHud* createHud(const Config& cfg, IHud::ActionCallback onAction) {
    auto* hud = new D2dHud();
    if (hud->init(cfg, std::move(onAction))) return hud;
    logWarn("HUD: נפילה למצב headless");
    delete hud;
    return new HudNull();
}
} // namespace aj
