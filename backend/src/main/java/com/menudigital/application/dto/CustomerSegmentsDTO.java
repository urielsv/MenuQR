package com.menudigital.application.dto;

import java.util.List;

public class CustomerSegmentsDTO {
    public String date;
    public List<Segment> segments;

    public static class Segment {
        public String name;
        public double percentage;
        public double avgItemsViewed;
        public int count;
    }
}
