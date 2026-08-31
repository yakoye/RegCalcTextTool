cmake_minimum_required(VERSION 3.21)
project(RegCalc64Desktop VERSION 0.1.6 LANGUAGES CXX RC)

if(NOT WIN32)
  message(FATAL_ERROR "RegCalc64 Desktop currently targets Windows only.")
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(WEBVIEW2_ROOT "${CMAKE_SOURCE_DIR}/third_party/webview2" CACHE PATH "Extracted Microsoft.Web.WebView2 NuGet package root")
set(WEBVIEW2_INCLUDE "${WEBVIEW2_ROOT}/build/native/include")
set(WEBVIEW2_LOADER_LIB "${WEBVIEW2_ROOT}/build/native/x64/WebView2LoaderStatic.lib")
set(WEBVIEW2_BOOTSTRAPPER "${CMAKE_SOURCE_DIR}/third_party/webview2-bootstrapper/MicrosoftEdgeWebview2Setup.exe")

if(NOT EXISTS "${WEBVIEW2_INCLUDE}/WebView2.h")
  message(FATAL_ERROR "WebView2 SDK headers not found. Run build.bat first (or tools/fetch-webview2.ps1).")
endif()
if(NOT EXISTS "${WEBVIEW2_LOADER_LIB}")
  message(FATAL_ERROR "WebView2LoaderStatic.lib not found for x64. Run build.bat first.")
endif()
if(NOT EXISTS "${WEBVIEW2_BOOTSTRAPPER}")
  message(FATAL_ERROR "WebView2 Evergreen Bootstrapper not found. Run build.bat first.")
endif()

add_executable(RegCalc64 WIN32
  src/main.cpp
  resources/app.rc
)

target_include_directories(RegCalc64 PRIVATE
  "${WEBVIEW2_INCLUDE}"
  "${CMAKE_SOURCE_DIR}/resources"
)
target_compile_definitions(RegCalc64 PRIVATE
  UNICODE _UNICODE NOMINMAX WIN32_LEAN_AND_MEAN
  WINVER=0x0A00 _WIN32_WINNT=0x0A00
)

if(MSVC)
  target_compile_options(RegCalc64 PRIVATE /W4 /permissive- /utf-8 /EHsc)
  # app.rc already embeds resources/app.manifest as RT_MANIFEST ID 1.
  # Disable MSVC/CMake linker manifest generation so CVTRES does not see
  # two MANIFEST resources with the same ID (CVT1100).
  target_link_options(RegCalc64 PRIVATE /MANIFEST:NO)
endif()

target_link_libraries(RegCalc64 PRIVATE
  "${WEBVIEW2_LOADER_LIB}"
  version
  user32
  shell32
  shlwapi
  ole32
  dwmapi
  advapi32
  gdi32
  comctl32
)

set_property(DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}" PROPERTY VS_STARTUP_PROJECT RegCalc64)
