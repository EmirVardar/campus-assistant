package com.campus.backend.mapper;

import com.campus.backend.dto.AnnouncementDTO;
import com.campus.backend.dto.CreateAnnouncementDTO;
import com.campus.backend.entity.Announcement;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.NullValuePropertyMappingStrategy;

@Mapper(
        componentModel = "spring",
        nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE
)
public interface AnnouncementMapper {

    // Entity -> DTO
    AnnouncementDTO toDto(Announcement a);

    // Create DTO -> Entity (id ve source ETL tarafından atanacak)
    @Mapping(target = "id", ignore = true)
    @Mapping(target = "source", ignore = true)
    @Mapping(target = "scrapedAt", expression = "java(java.time.Instant.now())")
    @Mapping(target = "lang", constant = "tr")
    Announcement fromCreate(CreateAnnouncementDTO dto);
}

