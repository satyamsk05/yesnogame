"use client";

import { useEffect, useRef } from "react";
import { createChart, AreaSeries, IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";

interface Bet {
  id: string;
  direction: "UP" | "DOWN";
  stake: number;
  entry_price: number;
  status: string;
}

interface BTCChartProps {
  onPriceUpdate: (price: number) => void;
  activeBets: Bet[];
  roundStartPrice: number | null;
}

export default function BTCChart({ onPriceUpdate, activeBets, roundStartPrice }: BTCChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const priceLinesRef = useRef<any[]>([]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // 1. Initialize Chart
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { color: "transparent" },
        textColor: "#64748b",
        fontSize: 12,
        fontFamily: "system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.02)" },
        horzLines: { color: "rgba(255, 255, 255, 0.02)" },
      },
      rightPriceScale: {
        borderVisible: false,
        textColor: "#94a3b8",
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: true,
      },
    });

    // 2. Initialize Area Series
    const series = chart.addSeries(AreaSeries, {
      topColor: "rgba(59, 130, 246, 0.2)",
      bottomColor: "rgba(59, 130, 246, 0.0)",
      lineColor: "#3b82f6",
      lineWidth: 2,
      crosshairMarkerVisible: true,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // 3. Connect to Binance WebSocket for real-time BTC price stream
    const ws = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@miniTicker");

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.c) {
          const price = parseFloat(data.c);
          const time = Math.floor(Date.now() / 1000) as UTCTimestamp;

          // Update chart line
          series.update({
            time,
            value: price,
          });

          // Propagate price to parent component
          onPriceUpdate(price);
        }
      } catch (err) {
        console.error("Error parsing WebSocket message:", err);
      }
    };

    // Handle container resize
    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };
    window.addEventListener("resize", handleResize);

    // Clean up
    return () => {
      window.removeEventListener("resize", handleResize);
      ws.close();
      chart.remove();
    };
  }, [onPriceUpdate]);

  // 4. Update horizontal prediction lines when activeBets or roundStartPrice changes
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    // Clear old lines
    priceLinesRef.current.forEach((line) => {
      try {
        series.removePriceLine(line);
      } catch (e) {
        // Line might already be deleted
      }
    });
    priceLinesRef.current = [];

    // Add round start price line as reference
    if (roundStartPrice) {
      const startLine = series.createPriceLine({
        price: roundStartPrice,
        color: "rgba(148, 163, 184, 0.5)", // Slate color
        lineWidth: 1,
        lineStyle: 1, // Dashed
        axisLabelVisible: true,
        title: "ROUND START",
      });
      priceLinesRef.current.push(startLine);
    }

    // Add active prediction entry lines
    activeBets.forEach((bet) => {
      const isUp = bet.direction === "UP";
      const line = series.createPriceLine({
        price: bet.entry_price,
        color: isUp ? "#10b981" : "#ef4444",
        lineWidth: 2,
        lineStyle: 2, // Dotted
        axisLabelVisible: true,
        title: `₹${bet.stake} ${isUp ? "↑ UP" : "↓ DOWN"}`,
      });
      priceLinesRef.current.push(line);
    });
  }, [activeBets, roundStartPrice]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={chartContainerRef} style={{ width: "100%", minHeight: "400px" }} />
    </div>
  );
}
