<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="csrf-token" content="{{ csrf_token() }}">
        <meta name="app-base-path" content="{{ request()->getBaseUrl() }}">
        <meta name="theme-color" content="#087f74">
        <meta name="description" content="Warehouse inventory, representative stock, sales, cash, and customer credit operations.">
        <meta name="mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-status-bar-style" content="default">
        <meta name="apple-mobile-web-app-title" content="StockFlow">
        <link rel="manifest" href="{{ request()->getBaseUrl() }}/manifest.webmanifest">
        <link rel="icon" href="{{ request()->getBaseUrl() }}/icons/stockflow.svg" type="image/svg+xml">

        <title>{{ config('app.name', 'Inventory') }}</title>

        @viteReactRefresh
        @vite(['resources/css/app.css', 'resources/js/app.tsx'])
    </head>
    <body>
        <div id="app"></div>
    </body>
</html>
