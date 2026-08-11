// =============================================================================
//  Adiel Junior — WasapiAudioOut (Windows)
// =============================================================================
#include "audio/WasapiAudioOut.h"

#ifdef _WIN32

#include <avrt.h>
#include <functiondiscoverykeys_devpkey.h>

#include <algorithm>
#include <cstring>

#include "core/Logger.h"

#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "avrt.lib")

namespace aj {

bool WasapiAudioOut::open(int sampleRate, int channels) {
    CoInitializeEx(nullptr, COINIT_MULTITHREADED);

    Microsoft::WRL::ComPtr<IMMDeviceEnumerator> enumerator;
    HRESULT hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
                                  IID_PPV_ARGS(&enumerator));
    if (FAILED(hr)) return false;
    hr = enumerator->GetDefaultAudioEndpoint(eRender, eConsole, &m_device);
    if (FAILED(hr)) return false;

    hr = m_device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, &m_client);
    if (FAILED(hr)) return false;

    WAVEFORMATEX fmt{};
    fmt.wFormatTag = WAVE_FORMAT_IEEE_FLOAT;
    fmt.nChannels = static_cast<WORD>(channels);
    fmt.nSamplesPerSec = static_cast<DWORD>(sampleRate);
    fmt.wBitsPerSample = 32;
    fmt.nBlockAlign = fmt.nChannels * 4;
    fmt.nAvgBytesPerSec = fmt.nSamplesPerSec * fmt.nBlockAlign;
    fmt.cbSize = 0;

    m_event = CreateEvent(nullptr, FALSE, FALSE, nullptr);
    if (!m_event) return false;

    hr = m_client->Initialize(AUDCLNT_SHAREMODE_SHARED,
                              AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM |
                              AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,
                              1000000 / 10 /* 100ms */, 0, &fmt, nullptr);
    if (FAILED(hr)) {
        // נפילה: פורמט ברירת המחדל של המכשיר
        hr = m_client->Initialize(AUDCLNT_SHAREMODE_SHARED,
                                  AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM |
                                  AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,
                                  1000000 / 10, 0, nullptr, nullptr);
        if (FAILED(hr)) {
            CloseHandle(m_event);
            m_event = nullptr;
            return false;
        }
        // ברר מה הפורמט בפועל
        WAVEFORMATEX* mix = nullptr;
        if (SUCCEEDED(m_client->GetMixFormat(&mix)) && mix) {
            m_sampleRate = mix->nSamplesPerSec;
            m_channels = mix->nChannels;
            CoTaskMemFree(mix);
        }
    } else {
        m_sampleRate = static_cast<UINT32>(sampleRate);
        m_channels = static_cast<UINT32>(channels);
    }

    m_client->SetEventHandle(m_event);
    hr = m_client->GetService(IID_PPV_ARGS(&m_render));
    if (FAILED(hr)) return false;
    m_client->GetBufferSize(&m_bufferFrames);
    return true;
}

void WasapiAudioOut::close() {
    if (m_client) m_client->Stop();
    m_render.Reset();
    m_client.Reset();
    m_device.Reset();
    if (m_event) { CloseHandle(m_event); m_event = nullptr; }
    CoUninitialize();
}

void WasapiAudioOut::play(const std::vector<float>& samples, std::atomic<bool>& interrupt) {
    if (!m_render || samples.empty()) return;

    m_client->Start();
    DWORD taskIndex = 0;
    HANDLE hTask = AvSetMmThreadCharacteristics(L"Pro Audio", &taskIndex);

    size_t pos = 0;
    std::vector<float> buf;
    buf.resize(static_cast<size_t>(m_bufferFrames) * m_channels);

    while (pos < samples.size() && !interrupt.load()) {
        // כמה מקום פנוי?
        UINT32 pad = 0;
        m_client->GetCurrentPadding(&pad);
        UINT32 available = m_bufferFrames - pad;
        if (available == 0) {
            WaitForSingleObject(m_event, 200);
            continue;
        }

        size_t toWrite = std::min<size_t>(available, samples.size() - pos);
        // העתקה מונו → ערוצים
        for (size_t i = 0; i < toWrite; ++i) {
            for (UINT32 c = 0; c < m_channels; ++c) {
                buf[i * m_channels + c] = samples[pos + i];
            }
        }
        BYTE* data = nullptr;
        if (SUCCEEDED(m_render->GetBuffer(static_cast<UINT32>(toWrite), &data))) {
            std::memcpy(data, buf.data(), toWrite * m_channels * sizeof(float));
            m_render->ReleaseBuffer(static_cast<UINT32>(toWrite), 0);
            pos += toWrite;
        } else {
            break;
        }
    }

    // המתנה לסיום השמעת שאריות
    while (!interrupt.load()) {
        UINT32 pad = 0;
        m_client->GetCurrentPadding(&pad);
        if (pad == 0) break;
        WaitForSingleObject(m_event, 200);
    }

    if (hTask) AvRevertMmThreadCharacteristics(hTask);
    m_client->Stop();
}

} // namespace aj

#endif // _WIN32
