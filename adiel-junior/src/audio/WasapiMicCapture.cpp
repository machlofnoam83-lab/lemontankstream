// =============================================================================
//  Adiel Junior — WasapiMicCapture (Windows)
// =============================================================================
#include "audio/WasapiMicCapture.h"

#ifdef _WIN32

#include <audiopolicy.h>
#include <mmdeviceapi.h>
#include <avrt.h>
#include <functiondiscoverykeys_devpkey.h>
#include <propidl.h>
#include <wrl/client.h>

#include <algorithm>
#include <vector>

#include "core/Logger.h"

#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "avrt.lib")

namespace aj {

namespace {
constexpr int kTargetRate = 16000;
constexpr REFERENCE_TIME kBufferHns = 2000000; // 200ms
}

WasapiMicCapture::~WasapiMicCapture() { stop(); }

bool WasapiMicCapture::start(Callback cb) {
    if (m_running.load()) return true;
    m_cb = std::move(cb);
    m_running = true;
    m_thread = std::thread([this] { run(); });
    return true;
}

void WasapiMicCapture::stop() {
    m_running = false;
    if (m_thread.joinable()) m_thread.join();
}

void WasapiMicCapture::run() {
    CoInitializeEx(nullptr, COINIT_MULTITHREADED);

    // ---- 1. בחירת מכשיר
    Microsoft::WRL::ComPtr<IMMDeviceEnumerator> enumerator;
    HRESULT hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
                                  IID_PPV_ARGS(&enumerator));
    if (FAILED(hr)) { logError("WASAPI mic: לא ניתן ליצור MMDeviceEnumerator"); CoUninitialize(); return; }

    Microsoft::WRL::ComPtr<IMMDevice> device;
    if (!m_cfg.micDeviceId.empty()) {
        // חיפוש לפי מזהה מכשיר
        Microsoft::WRL::ComPtr<IMMDeviceCollection> coll;
        enumerator->EnumAudioEndpoints(eCapture, DEVICE_STATE_ACTIVE, &coll);
        UINT count = 0;
        coll->GetCount(&count);
        for (UINT i = 0; i < count && !device; ++i) {
            Microsoft::WRL::ComPtr<IMMDevice> cand;
            coll->Item(i, &cand);
            LPWSTR id = nullptr;
            if (SUCCEEDED(cand->GetId(&id)) && id) {
                std::wstring ws = id;
                CoTaskMemFree(id);
                if (ws == std::wstring(m_cfg.micDeviceId.begin(), m_cfg.micDeviceId.end())) {
                    device = cand;
                }
            }
        }
        if (!device) {
            logWarn("WASAPI mic: מכשיר %s לא נמצא — משתמש בברירת מחדל", m_cfg.micDeviceId.c_str());
        }
    }
    if (!device) {
        hr = enumerator->GetDefaultAudioEndpoint(eCapture, eCommunications, &device);
        if (FAILED(hr)) hr = enumerator->GetDefaultAudioEndpoint(eCapture, eConsole, &device);
        if (FAILED(hr)) {
            logError("WASAPI mic: אין מכשיר לכידה זמין (0x%08X)", static_cast<unsigned>(hr));
            CoUninitialize();
            return;
        }
    }

    // שם המכשיר (ליומן)
    {
        Microsoft::WRL::ComPtr<IPropertyStore> props;
        if (SUCCEEDED(device->OpenPropertyStore(STGM_READ, &props))) {
            PROPVARIANT pv{};
            if (SUCCEEDED(props->GetValue(PKEY_Device_FriendlyName, &pv)) && pv.pwszVal) {
                int n = WideCharToMultiByte(CP_UTF8, 0, pv.pwszVal, -1, nullptr, 0, nullptr, nullptr);
                m_deviceName.resize(static_cast<size_t>(n ? n - 1 : 0));
                if (n > 1) WideCharToMultiByte(CP_UTF8, 0, pv.pwszVal, -1,
                                               m_deviceName.data(), n, nullptr, nullptr);
                PropVariantClear(&pv);
            }
        }
    }

    // ---- 2. הגדרת IAudioClient
    Microsoft::WRL::ComPtr<IAudioClient> client;
    hr = device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, &client);
    if (FAILED(hr)) { logError("WASAPI mic: Activate נכשל (0x%08X)", static_cast<unsigned>(hr)); CoUninitialize(); return; }

    WAVEFORMATEX* mixFmt = nullptr;
    hr = client->GetMixFormat(&mixFmt);
    if (FAILED(hr) || !mixFmt) { logError("WASAPI mic: GetMixFormat נכשל"); CoUninitialize(); return; }

    // הוצאת ערוצים וקצב דגימה (תמיכה ב-WAVEFORMATEXTENSIBLE)
    int inChannels = mixFmt->nChannels;
    int inRate = static_cast<int>(mixFmt->nSamplesPerSec);
    bool isFloat = (mixFmt->wFormatTag == WAVE_FORMAT_IEEE_FLOAT);
    if (mixFmt->wFormatTag == WAVE_FORMAT_EXTENSIBLE) {
        WAVEFORMATEXTENSIBLE* ext = reinterpret_cast<WAVEFORMATEXTENSIBLE*>(mixFmt);
        isFloat = (ext->SubFormat == KSDATAFORMAT_SUBTYPE_IEEE_FLOAT);
    }
    bool is16bit = (mixFmt->wFormatTag == WAVE_FORMAT_PCM) ||
                   (mixFmt->wFormatTag == WAVE_FORMAT_EXTENSIBLE && !isFloat && mixFmt->wBitsPerSample == 16);
    CoTaskMemFree(mixFmt);

    logInfo("WASAPI mic: %s (%d ערוצים, %d הרץ, %s)",
            m_deviceName.empty() ? "מכשיר ברירת מחדל" : m_deviceName.c_str(),
            inChannels, inRate, isFloat ? "float" : is16bit ? "pcm16" : "אחר");

    HANDLE hEvent = CreateEvent(nullptr, FALSE, FALSE, nullptr);
    if (!hEvent) { CoUninitialize(); return; }

    hr = client->Initialize(AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
                            kBufferHns, 0, nullptr, nullptr);
    if (FAILED(hr)) {
        // ניסיון עם פורמט ברירת המחדל של המנוע
        hr = client->Initialize(AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
                                kBufferHns, 0, nullptr, nullptr);
    }
    if (FAILED(hr)) {
        logError("WASAPI mic: Initialize נכשל (0x%08X)", static_cast<unsigned>(hr));
        CloseHandle(hEvent);
        CoUninitialize();
        return;
    }
    client->SetEventHandle(hEvent);

    Microsoft::WRL::ComPtr<IAudioCaptureClient> capture;
    hr = client->GetService(IID_PPV_ARGS(&capture));
    if (FAILED(hr)) { CloseHandle(hEvent); CoUninitialize(); return; }

    UINT32 packetFrames = 0;
    client->GetBufferSize(&packetFrames);

    // ---- 3. לולאת לכידה
    client->Start();
    DWORD taskIndex = 0;
    HANDLE hTask = AvSetMmThreadCharacteristics(L"Pro Audio", &taskIndex);

    // חוצץ המרה ל-16k
    std::vector<float> convertBuf;
    convertBuf.reserve(static_cast<size_t>(packetFrames) + 256);
    std::vector<float> outBuf;

    while (m_running.load()) {
        DWORD wait = WaitForSingleObject(hEvent, 500);
        if (wait == WAIT_TIMEOUT) continue;
        if (wait != WAIT_OBJECT_0) break;

        UINT32 frames = 0;
        BYTE* data = nullptr;
        DWORD flags = 0;
        hr = capture->GetBuffer(&data, &frames, &flags, nullptr, nullptr);
        if (hr == AUDCLNT_S_BUFFER_EMPTY) continue;
        if (FAILED(hr)) {
            logWarn("WASAPI mic: GetBuffer נכשל (0x%08X) — מאפס", static_cast<unsigned>(hr));
            client->Stop();
            client->Start();
            continue;
        }
        if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
            frames = 0;
        }

        if (frames > 0 && data && m_cb) {
            convertBuf.clear();
            outBuf.clear();

            if (isFloat) {
                const float* src = reinterpret_cast<const float*>(data);
                for (UINT32 i = 0; i < frames; ++i) {
                    float v = 0.0f;
                    for (int c = 0; c < inChannels; ++c) v += src[static_cast<size_t>(i) * inChannels + c];
                    convertBuf.push_back(v / static_cast<float>(inChannels));
                }
            } else if (is16bit) {
                const int16_t* src = reinterpret_cast<const int16_t*>(data);
                for (UINT32 i = 0; i < frames; ++i) {
                    float v = 0.0f;
                    for (int c = 0; c < inChannels; ++c) v += src[static_cast<size_t>(i) * inChannels + c];
                    convertBuf.push_back((v / static_cast<float>(inChannels)) / 32768.0f);
                }
            } else {
                // פורמט לא ידוע — נשמיט (שקט)
                logWarn("WASAPI mic: פורמט לא נתמך");
            }

            // דגימה מחדש לינארית ל-16k
            if (inRate != kTargetRate && !convertBuf.empty()) {
                const double ratio = static_cast<double>(kTargetRate) / inRate;
                const size_t outN = static_cast<size_t>(static_cast<double>(convertBuf.size()) * ratio);
                outBuf.reserve(outN + 1);
                for (size_t i = 0; i < outN; ++i) {
                    double pos = static_cast<double>(i) / ratio;
                    size_t i0 = static_cast<size_t>(pos);
                    size_t i1 = std::min(i0 + 1, convertBuf.size() - 1);
                    double frac = pos - static_cast<double>(i0);
                    outBuf.push_back(static_cast<float>(convertBuf[i0] * (1.0 - frac) + convertBuf[i1] * frac));
                }
                m_cb(outBuf.data(), outBuf.size());
            } else if (!convertBuf.empty()) {
                m_cb(convertBuf.data(), convertBuf.size());
            }
        }

        capture->ReleaseBuffer(frames);
    }

    client->Stop();
    if (hTask) AvRevertMmThreadCharacteristics(hTask);
    CloseHandle(hEvent);
    CoUninitialize();
    logInfo("WASAPI mic: לכידה הופסקה");
}

// פונקציית עזר כללית (גם למי שלא משתמש ב-WASAPI)
void convertToMono16k(const float* in, size_t frames, int inChannels, int inRate,
                      std::vector<float>& out) {
    out.clear();
    if (!in || frames == 0) return;
    std::vector<float> mono;
    mono.reserve(frames);
    for (size_t i = 0; i < frames; ++i) {
        float v = 0.0f;
        for (int c = 0; c < inChannels; ++c) v += in[i * static_cast<size_t>(inChannels) + c];
        mono.push_back(v / static_cast<float>(inChannels));
    }
    if (inRate == kTargetRate) {
        out = std::move(mono);
        return;
    }
    const double ratio = static_cast<double>(kTargetRate) / inRate;
    const size_t outN = static_cast<size_t>(static_cast<double>(mono.size()) * ratio);
    out.reserve(outN + 1);
    for (size_t i = 0; i < outN; ++i) {
        double pos = static_cast<double>(i) / ratio;
        size_t i0 = static_cast<size_t>(pos);
        size_t i1 = std::min(i0 + 1, mono.size() - 1);
        double frac = pos - static_cast<double>(i0);
        out.push_back(static_cast<float>(mono[i0] * (1.0 - frac) + mono[i1] * frac));
    }
}

} // namespace aj

#endif // _WIN32
