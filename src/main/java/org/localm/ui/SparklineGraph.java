package org.localm.ui;

import javax.swing.*;
import java.awt.*;
import java.util.ArrayList;
import java.util.List;

public class SparklineGraph extends JComponent {
    private final List<Integer> dataPoints = new ArrayList<>();
    private final int maxPoints = 60;
    private int maxValue = 100;
    private final String label;
    private final Color lineColor;

    public SparklineGraph(String label, Color lineColor) {
        this.label = label;
        this.lineColor = lineColor;
        setPreferredSize(new Dimension(0, 60));
    }

    public void addValue(int value) {
        dataPoints.add(value);
        if (dataPoints.size() > maxPoints) {
            dataPoints.remove(0);
        }
        maxValue = Math.max(1024, dataPoints.stream().max(Integer::compare).orElse(1024));
        repaint();
    }

    @Override
    protected void paintComponent(Graphics g) {
        super.paintComponent(g);
        Graphics2D g2 = (Graphics2D) g;
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

        int w = getWidth();
        int h = getHeight();

        // Background
        g2.setColor(new Color(30, 33, 45));
        g2.fillRect(0, 0, w, h);

        if (dataPoints.size() < 2) {
            g2.setColor(Color.GRAY);
            g2.drawString(label + ": (Waiting for data...)", 10, 20);
            return;
        }

        // Draw Line
        g2.setColor(lineColor);
        g2.setStroke(new BasicStroke(2f));

        double xStep = (double) w / (maxPoints - 1);
        int offset = maxPoints - dataPoints.size();

        int[] xPoints = new int[dataPoints.size()];
        int[] yPoints = new int[dataPoints.size()];

        for (int i = 0; i < dataPoints.size(); i++) {
            xPoints[i] = (int) ((i + offset) * xStep);
            yPoints[i] = h - (int) ((double) dataPoints.get(i) / maxValue * (h - 10)) - 5;
        }

        g2.drawPolyline(xPoints, yPoints, dataPoints.size());

        // Label
        g2.setColor(Color.WHITE);
        g2.setFont(getFont().deriveFont(Font.BOLD, 10f));
        int lastVal = dataPoints.get(dataPoints.size() - 1);
        g2.drawString(label + ": " + lastVal + " MB", 10, 15);
    }
}
