// =============================================================================
//  Adiel Junior — D2dHud
//  ממשק הולוגרפי צף (JARVIS-style):
//   - Direct2D (D2D1.3) על Direct3D 12 (דרך 11on12) עם נפילה ל-D3D11
//   - DirectComposition — שכבה שקופה תמיד-על-הכל, 60fps, GPU compositing
//   - חלון click-through (WM_NCHITTEST → HTTRANSPARENT) עם כפתורים אינטראקטיביים
//   - טקסט עברית RTL (DirectWrite), טבעות אנרגיה + גל קול FFT
// =============================================================================
#pragma once

#ifdef _WIN32
#include <windows.h>

#include <d2d1_1.h>
#include <d3d11.h>
#include <d3d11on12.h>
#include <d3d12.h>
#include <dcomp.h>
#include <dwrite.h>
#include <wrl/client.h>

#include <atomic>
#include <string>
#include <vector>

#include "hud/IHud.h"
#include "hud/HudModel.h"

namespace aj {

class D2dHud final : public IHud {
public:
    D2dHud();
    ~D2dHud() override;

    bool init(const Config& cfg, ActionCallback onAction) override;
    void run() override;
    void requestExit() override;

    void setMode(const std::string& m) override { m_model.setMode(m); }
    void setStatus(const std::string& s) override { m_model.setStatus(s); }
    void setUserText(const std::string& t) override { m_model.setUserText(t); }
    void setTokens(const std::string& t) override { m_model.setTokens(t); }
    void clearTokens() override { m_model.clearTokens(); }
    void setEngineName(const std::string& n) override { m_model.setEngineName(n); }
    void setEnergy(float e) override { m_model.setEnergy(e); }
    void setBins(const std::vector<float>& bins) override { m_model.setBins(bins); }
    void setState(const std::string& s) override { m_model.setState(s); }
    std::string mode() const override { return m_model.getMode(); }

    HWND hwnd() const { return m_hwnd; }

private:
    bool createDevice();
    bool createD2D();
    bool createDComp();
    bool createWindow();
    bool createResources();

    void renderFrame();
    void renderReactor(ID2D1DeviceContext* ctx, D2D1_POINT_2F center, float r, double t);
    void renderWaveform(ID2D1DeviceContext* ctx, D2D1_RECT_F area, double t);
    void renderText(ID2D1DeviceContext* ctx, D2D1_RECT_F area, const std::wstring& text, float size, ID2D1Brush* brush);
    D2D1_COLOR_F stateColor() const;
    D2D1_RECT_F panelRect() const;

    LRESULT wndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam);
    static LRESULT CALLBACK wndProcThunk(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam);

    // COM אובייקטים
    Microsoft::WRL::ComPtr<ID3D12Device>        m_d3d12;
    Microsoft::WRL::ComPtr<ID3D12CommandQueue>  m_d3d12Queue;
    Microsoft::WRL::ComPtr<ID3D11Device>        m_d3d11;
    Microsoft::WRL::ComPtr<ID2D1Factory1>       m_d2dFactory;
    Microsoft::WRL::ComPtr<ID2D1Device>         m_d2dDevice;
    Microsoft::WRL::ComPtr<ID2D1DeviceContext>  m_d2dCtx;
    Microsoft::WRL::ComPtr<IDWriteFactory>      m_dwFactory;
    Microsoft::WRL::ComPtr<IDCompositionDevice> m_dcomp;
    Microsoft::WRL::ComPtr<IDCompositionTarget> m_dcompTarget;
    Microsoft::WRL::ComPtr<IDCompositionVisual> m_dcompVisual;
    Microsoft::WRL::ComPtr<IDCompositionSurface> m_surface;

    // משאבי רינדור
    Microsoft::WRL::ComPtr<ID2D1SolidColorBrush> m_brushState;
    Microsoft::WRL::ComPtr<ID2D1SolidColorBrush> m_brushDim;
    Microsoft::WRL::ComPtr<ID2D1SolidColorBrush> m_brushBright;
    Microsoft::WRL::ComPtr<ID2D1RadialGradientBrush> m_brushGlow;
    Microsoft::WRL::ComPtr<ID2D1LinearGradientBrush> m_brushPanel;
    Microsoft::WRL::ComPtr<ID2D1PathGeometry>    m_arcGeom;
    Microsoft::WRL::ComPtr<ID2D1StrokeStyle>     m_dashStroke;
    Microsoft::WRL::ComPtr<IDWriteTextFormat>    m_fmtStatus;
    Microsoft::WRL::ComPtr<IDWriteTextFormat>    m_fmtTokens;
    Microsoft::WRL::ComPtr<IDWriteTextFormat>    m_fmtSmall;
    Microsoft::WRL::ComPtr<IDWriteTextFormat>    m_fmtTitle;

    HWND m_hwnd = nullptr;
    int m_winW = 0, m_winH = 0;
    int m_panelW = 620, m_panelH = 400;
    float m_dpi = 96.0f;
    float m_opacity = 0.92f;
    std::string m_fontName = "Segoe UI";

    HudModel m_model;
    ActionCallback m_onAction;
    std::atomic<bool> m_exit{false};
    bool m_d3d12Active = false;

    // כפתורים (client coords, ביחס ללוח)
    D2D1_RECT_F m_btnDock, m_btnCenter, m_btnHide, m_btnClose;

    // גרירה
    bool m_dragging = false;
    POINT m_dragOffset{};
    D2D1_POINT_2F m_dragStartCursor{};
    D2D1_POINT_2F m_dragStartOffset{};
    uint64_t m_startTick = 0;
};

} // namespace aj
#endif // _WIN32
