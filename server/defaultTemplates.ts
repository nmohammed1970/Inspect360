// Default inspection templates for new organizations
// These templates are automatically created when a new organization is set up
// Comprehensive BTR (Build-to-Rent) templates covering all operational inspection needs

export const DEFAULT_TEMPLATES = [
  {
    name: "Check In",
    description: "To document the condition of a property at the start of a tenancy, recording evidence (photos, notes, etc.) of the property's state as handed over to the tenant.\n\nThis report establishes a baseline for future Check-Out and Maintenance inspections.",
    scope: "property" as const,
    categoryId: null,
    structureJson: {
      sections: [
        {
          id: "section_general_info",
          title: "General Information",
          fields: [
            {
              id: "field_checkin_property_address",
              key: "field_checkin_property_address",
              label: "Property Address",
              type: "long_text",
              required: true,
            },
            {
              id: "field_checkin_tenant_name",
              key: "field_checkin_tenant_name",
              label: "Tenant Name",
              type: "long_text",
              required: false,
            },
            {
              id: "field_checkin_inspection_date",
              key: "field_checkin_inspection_date",
              label: "Date of Inspection",
              type: "date",
              required: true,
            },
            {
              id: "field_checkin_inspector_name",
              key: "field_checkin_inspector_name",
              label: "Inspector Name",
              type: "long_text",
              required: false,
            },
            {
              id: "field_checkin_num_bedrooms",
              key: "field_checkin_num_bedrooms",
              label: "Number of Bedrooms",
              type: "number",
              required: true,
            },
            {
              id: "field_checkin_property_type",
              key: "field_checkin_property_type",
              label: "Property Type",
              type: "select",
              required: true,
              options: ["House", "Apartment", "Townhouse", "Unit", "Studio", "Other"],
            },
          ],
        },
        {
          id: "section_entry_hallway",
          title: "Entry / Hallway",
          fields: [
            {
              id: "field_checkin_entry_door_condition",
              key: "field_checkin_entry_door_condition",
              label: "Door Condition",
              type: "photo_array",
              required: false,
              includeCondition: true,
              includeCleanliness: true,
            },
            {
              id: "field_checkin_entry_floor_condition",
              key: "field_checkin_entry_floor_condition",
              label: "Floor Condition",
              type: "photo_array",
              required: false,
              options: ["Carpet", "Wooden Flooring", "Laminate", "Tile"],
              includeCondition: true,
              includeCleanliness: true,
            },
          ],
        },
        {
          id: "section_living_room",
          title: "Living Room",
          fields: [
            {
              id: "field_checkin_living_floor_condition",
              key: "field_checkin_living_floor_condition",
              label: "Floor Condition",
              type: "photo_array",
              required: false,
              options: ["Carpet", "Tile", "Wooden Floor", "Laminate"],
              includeCondition: true,
              includeCleanliness: true,
            },
            {
              id: "field_checkin_living_walls_paint",
              key: "field_checkin_living_walls_paint",
              label: "Walls and Paint",
              type: "photo_array",
              required: false,
              includeCondition: true,
              includeCleanliness: true,
            },
          ],
        },
        {
          id: "section_kitchen",
          title: "Kitchen",
          fields: [
            {
              id: "field_checkin_kitchen_condition",
              key: "field_checkin_kitchen_condition",
              label: "Kitchen Condition",
              type: "photo_array",
              required: false,
              includeCondition: true,
              includeCleanliness: true,
            },
          ],
        },
        {
          id: "section_bedrooms",
          title: "Bedrooms",
          repeatable: true,
          fields: [
            {
              id: "field_checkin_bedroom_room_name",
              key: "field_checkin_bedroom_room_name",
              label: "Room Name / Number",
              type: "short_text",
              required: false,
            },
            {
              id: "field_checkin_bedroom_floor_condition",
              key: "field_checkin_bedroom_floor_condition",
              label: "Floor Condition",
              type: "photo_array",
              required: false,
              options: ["Carpet", "Tile", "Wooden Floor", "Laminate"],
              includeCondition: true,
              includeCleanliness: true,
            },
            {
              id: "field_checkin_bedroom_walls_paint",
              key: "field_checkin_bedroom_walls_paint",
              label: "Walls and Paint",
              type: "photo_array",
              required: false,
              includeCondition: true,
              includeCleanliness: true,
            },
          ],
        },
        {
          id: "section_bathrooms",
          title: "Bathrooms",
          repeatable: true,
          fields: [
            {
              id: "field_checkin_bathroom_condition",
              key: "field_checkin_bathroom_condition",
              label: "Bathroom Condition",
              type: "photo_array",
              required: false,
              includeCondition: true,
              includeCleanliness: true,
            },
          ],
        },
        {
          id: "section_signoff",
          title: "Sign-Off",
          fields: [
            {
              id: "field_checkin_inspector_signature",
              key: "field_checkin_inspector_signature",
              label: "Inspector Signature",
              type: "signature",
              required: false,
            },
            {
              id: "field_checkin_tenant_signature",
              key: "field_checkin_tenant_signature",
              label: "Tenant Signature",
              type: "signature",
              required: false,
            },
          ],
        },
      ],
    },
  },
  {
    name: "Check Out",
    description: "A Check-Out Inspection is carried out at the end of a tenancy to assess the property's condition compared to the initial Check-In report. This inspection helps determine if the tenant is liable for any damage or excessive wear beyond normal use.",
    scope: "property" as const,
    categoryId: null,
    structureJson: {
      sections: [
        {
          id: "section_general_info",
          title: "General Information",
          fields: [
            {
              id: "field_checkout_property_address",
              key: "field_checkout_property_address",
              label: "Property Address",
              type: "short_text",
              required: false,
            },
            {
              id: "field_checkout_tenant_name",
              key: "field_checkout_tenant_name",
              label: "Tenant Name",
              type: "short_text",
              required: false,
            },
            {
              id: "field_checkout_inspection_date",
              key: "field_checkout_inspection_date",
              label: "Date of Inspection",
              type: "date",
              required: false,
            },
            {
              id: "field_checkout_inspector_name",
              key: "field_checkout_inspector_name",
              label: "Inspector's Name",
              type: "short_text",
              required: false,
            },
            {
              id: "field_checkout_num_bedrooms",
              key: "field_checkout_num_bedrooms",
              label: "Number of Bedrooms",
              type: "number",
              required: false,
            },
          ],
        },
        {
          id: "section_entry_hallway",
          title: "Entry / Hallway",
          fields: [
            {
              id: "field_checkout_entry_door_condition",
              key: "field_checkout_entry_door_condition",
              label: "Door Condition",
              type: "photo_array",
              required: false,
              includeCondition: true,
              includeCleanliness: true,
            },
            {
              id: "field_checkout_entry_floor_condition",
              key: "field_checkout_entry_floor_condition",
              label: "Floor Condition",
              type: "photo_array",
              required: false,
              options: ["Carpet", "Wooden Flooring", "Laminate", "Tile"],
              includeCondition: true,
              includeCleanliness: true,
            },
            {
              id: "field_checkout_entry_comments",
              key: "field_checkout_entry_comments",
              label: "Comments",
              type: "long_text",
              required: false,
            },
          ],
        },
        {
          id: "section_living_room",
          title: "Living Room",
          fields: [
            {
              id: "field_checkout_living_floor_condition",
              key: "field_checkout_living_floor_condition",
              label: "Floor Condition",
              type: "photo_array",
              required: false,
              options: ["Carpet", "Tile", "Wooden Floor", "Laminate"],
              includeCondition: true,
              includeCleanliness: true,
            },
            {
              id: "field_checkout_living_walls_paint",
              key: "field_checkout_living_walls_paint",
              label: "Walls and Paint",
              type: "photo_array",
              required: false,
              includeCondition: true,
              includeCleanliness: true,
            },
            {
              id: "field_checkout_living_comments",
              key: "field_checkout_living_comments",
              label: "Comments",
              type: "long_text",
              required: false,
            },
          ],
        },
        {
          id: "section_kitchen",
          title: "Kitchen",
          fields: [
            {
              id: "field_checkout_kitchen_condition",
              key: "field_checkout_kitchen_condition",
              label: "Kitchen Condition",
              type: "photo_array",
              required: false,
              includeCondition: true,
              includeCleanliness: true,
            },
          ],
        },
        {
          id: "section_bedroom",
          title: "Bedroom",
          repeatable: true,
          fields: [
            {
              id: "field_checkout_bedroom_room_name",
              key: "field_checkout_bedroom_room_name",
              label: "Room Name / Number",
              type: "short_text",
              required: false,
            },
            {
              id: "field_checkout_bedroom_floor_condition",
              key: "field_checkout_bedroom_floor_condition",
              label: "Floor Condition",
              type: "photo_array",
              required: false,
              includeCondition: true,
              includeCleanliness: true,
            },
            {
              id: "field_checkout_bedroom_comments",
              key: "field_checkout_bedroom_comments",
              label: "Comments",
              type: "long_text",
              required: false,
            },
          ],
        },
        {
          id: "section_bathroom",
          title: "Bathroom",
          repeatable: true,
          fields: [
            {
              id: "field_checkout_bathroom_condition",
              key: "field_checkout_bathroom_condition",
              label: "Bathroom Condition",
              type: "photo_array",
              required: false,
              includeCondition: true,
              includeCleanliness: true,
            },
          ],
        },
        {
          id: "section_signoff",
          title: "Sign Off",
          fields: [
            {
              id: "field_checkout_tenant_signature",
              key: "field_checkout_tenant_signature",
              label: "Tenant Signature",
              type: "signature",
              required: false,
            },
            {
              id: "field_checkout_inspector_signature",
              key: "field_checkout_inspector_signature",
              label: "Inspector Signature",
              type: "signature",
              required: false,
            },
            {
              id: "field_checkout_next_inspection",
              key: "field_checkout_next_inspection",
              label: "Next Scheduled Inspection",
              type: "date",
              required: false,
            },
          ],
        },
      ],
    },
  },
  {
    name: "Periodic Inspection",
    description: "A routine inspection conducted quarterly or annually to assess the overall condition of the property, ensure tenant compliance with lease terms, and identify any maintenance issues requiring attention.\n\nThis inspection helps maintain property standards and prevents minor issues from becoming major problems.",
    scope: "property" as const,
    categoryId: null,
    structureJson: {
      sections: [
        {
          id: "section_general",
          title: "General Information",
          fields: [
            { id: "field_periodic_property", key: "field_periodic_property", label: "Property Address", type: "short_text", required: true },
            { id: "field_periodic_date", key: "field_periodic_date", label: "Inspection Date", type: "date", required: true },
            { id: "field_periodic_inspector", key: "field_periodic_inspector", label: "Inspector Name", type: "short_text", required: true },
            { id: "field_periodic_tenant_present", key: "field_periodic_tenant_present", label: "Tenant Present", type: "select", options: ["Yes", "No"], required: false },
          ],
        },
        {
          id: "section_exterior",
          title: "Exterior Condition",
          fields: [
            { id: "field_periodic_ext_walls", key: "field_periodic_ext_walls", label: "External Walls", type: "photo_array", required: false, includeCondition: true },
            { id: "field_periodic_roof", key: "field_periodic_roof", label: "Roof Condition", type: "photo_array", required: false, includeCondition: true },
            { id: "field_periodic_gutters", key: "field_periodic_gutters", label: "Gutters and Downpipes", type: "photo_array", required: false, includeCondition: true },
            { id: "field_periodic_windows", key: "field_periodic_windows", label: "Windows and Frames", type: "photo_array", required: false, includeCondition: true },
            { id: "field_periodic_doors", key: "field_periodic_doors", label: "External Doors", type: "photo_array", required: false, includeCondition: true },
          ],
        },
        {
          id: "section_interior",
          title: "Interior Condition",
          fields: [
            { id: "field_periodic_walls", key: "field_periodic_walls", label: "Walls and Ceilings", type: "photo_array", required: false, includeCondition: true, includeCleanliness: true },
            { id: "field_periodic_flooring", key: "field_periodic_flooring", label: "Flooring", type: "photo_array", required: false, includeCondition: true, includeCleanliness: true },
            { id: "field_periodic_fixtures", key: "field_periodic_fixtures", label: "Fixtures and Fittings", type: "photo_array", required: false, includeCondition: true },
            { id: "field_periodic_heating", key: "field_periodic_heating", label: "Heating System", type: "photo_array", required: false, includeCondition: true },
          ],
        },
        {
          id: "section_safety",
          title: "Safety Checks",
          fields: [
            { id: "field_periodic_smoke", key: "field_periodic_smoke", label: "Smoke Alarms Tested", type: "select", options: ["Pass", "Fail", "Not Tested"], required: true },
            { id: "field_periodic_co", key: "field_periodic_co", label: "CO Detectors Tested", type: "select", options: ["Pass", "Fail", "Not Tested"], required: true },
            { id: "field_periodic_locks", key: "field_periodic_locks", label: "Door Locks Functional", type: "select", options: ["Yes", "No"], required: false },
          ],
        },
        {
          id: "section_tenancy",
          title: "Tenancy Compliance",
          fields: [
            { id: "field_periodic_overcrowding", key: "field_periodic_overcrowding", label: "Signs of Overcrowding", type: "select", options: ["No", "Yes - Concerns Noted"], required: false },
            { id: "field_periodic_pets", key: "field_periodic_pets", label: "Unauthorized Pets", type: "select", options: ["None", "Noted"], required: false },
            { id: "field_periodic_alterations", key: "field_periodic_alterations", label: "Unauthorized Alterations", type: "select", options: ["None", "Noted"], required: false },
            { id: "field_periodic_compliance_notes", key: "field_periodic_compliance_notes", label: "Compliance Notes", type: "long_text", required: false },
          ],
        },
        {
          id: "section_summary",
          title: "Summary and Actions",
          fields: [
            { id: "field_periodic_overall", key: "field_periodic_overall", label: "Overall Property Condition", type: "select", options: ["Excellent", "Good", "Fair", "Poor"], required: true },
            { id: "field_periodic_actions", key: "field_periodic_actions", label: "Actions Required", type: "long_text", required: false },
            { id: "field_periodic_next", key: "field_periodic_next", label: "Next Inspection Date", type: "date", required: false },
            { id: "field_periodic_signature", key: "field_periodic_signature", label: "Inspector Signature", type: "signature", required: false },
          ],
        },
      ],
    },
  },
  {
    name: "Fire Safety Inspection",
    description: "A dedicated fire safety inspection to ensure all fire prevention equipment and procedures are compliant with regulations. Essential for BTR operations to maintain tenant safety and legal compliance.\n\nCovers fire alarms, extinguishers, emergency exits, signage, and evacuation routes.",
    scope: "block" as const,
    categoryId: null,
    structureJson: {
      sections: [
        {
          id: "section_general",
          title: "General Information",
          fields: [
            { id: "field_fire_block", key: "field_fire_block", label: "Block/Building Name", type: "short_text", required: true },
            { id: "field_fire_date", key: "field_fire_date", label: "Inspection Date", type: "date", required: true },
            { id: "field_fire_inspector", key: "field_fire_inspector", label: "Inspector Name", type: "short_text", required: true },
            { id: "field_fire_last_inspection", key: "field_fire_last_inspection", label: "Last Inspection Date", type: "date", required: false },
          ],
        },
        {
          id: "section_alarms",
          title: "Fire Alarms and Detection",
          fields: [
            { id: "field_fire_alarm_system", key: "field_fire_alarm_system", label: "Fire Alarm System Type", type: "short_text", required: false },
            { id: "field_fire_alarm_test", key: "field_fire_alarm_test", label: "Alarm System Tested", type: "select", options: ["Pass", "Fail", "Not Tested"], required: true },
            { id: "field_fire_alarm_photo", key: "field_fire_alarm_photo", label: "Fire Alarm Panel Photo", type: "photo_array", required: false },
            { id: "field_fire_smoke_detectors", key: "field_fire_smoke_detectors", label: "Smoke Detectors", type: "photo_array", required: false, includeCondition: true },
            { id: "field_fire_heat_detectors", key: "field_fire_heat_detectors", label: "Heat Detectors", type: "photo_array", required: false, includeCondition: true },
            { id: "field_fire_alarm_notes", key: "field_fire_alarm_notes", label: "Alarm System Notes", type: "long_text", required: false },
          ],
        },
        {
          id: "section_extinguishers",
          title: "Fire Extinguishers",
          repeatable: true,
          fields: [
            { id: "field_fire_ext_location", key: "field_fire_ext_location", label: "Location", type: "short_text", required: false },
            { id: "field_fire_ext_type", key: "field_fire_ext_type", label: "Extinguisher Type", type: "select", options: ["Water", "Foam", "CO2", "Powder", "Wet Chemical"], required: false },
            { id: "field_fire_ext_expiry", key: "field_fire_ext_expiry", label: "Service Due Date", type: "date", required: false },
            { id: "field_fire_ext_photo", key: "field_fire_ext_photo", label: "Photo", type: "photo_array", required: false, includeCondition: true },
            { id: "field_fire_ext_status", key: "field_fire_ext_status", label: "Status", type: "select", options: ["Serviceable", "Requires Service", "Faulty"], required: true },
          ],
        },
        {
          id: "section_exits",
          title: "Emergency Exits and Routes",
          fields: [
            { id: "field_fire_exit_clear", key: "field_fire_exit_clear", label: "All Exits Clear and Accessible", type: "select", options: ["Yes", "No - Issues Noted"], required: true },
            { id: "field_fire_exit_photos", key: "field_fire_exit_photos", label: "Exit Route Photos", type: "photo_array", required: false },
            { id: "field_fire_exit_signage", key: "field_fire_exit_signage", label: "Exit Signage Visible", type: "select", options: ["Yes", "No - Issues Noted"], required: true },
            { id: "field_fire_emergency_lights", key: "field_fire_emergency_lights", label: "Emergency Lighting Functional", type: "select", options: ["Pass", "Fail", "Not Tested"], required: true },
            { id: "field_fire_exit_notes", key: "field_fire_exit_notes", label: "Exit/Route Notes", type: "long_text", required: false },
          ],
        },
        {
          id: "section_doors",
          title: "Fire Doors",
          fields: [
            { id: "field_fire_doors_close", key: "field_fire_doors_close", label: "Fire Doors Self-Closing", type: "select", options: ["Yes - All Functional", "Some Issues", "No - Attention Required"], required: true },
            { id: "field_fire_doors_seals", key: "field_fire_doors_seals", label: "Door Seals Intact", type: "select", options: ["Yes", "No - Replacement Needed"], required: false },
            { id: "field_fire_doors_photos", key: "field_fire_doors_photos", label: "Fire Door Photos", type: "photo_array", required: false, includeCondition: true },
            { id: "field_fire_doors_notes", key: "field_fire_doors_notes", label: "Fire Door Notes", type: "long_text", required: false },
          ],
        },
        {
          id: "section_compliance",
          title: "Compliance and Documentation",
          fields: [
            { id: "field_fire_risk_assessment", key: "field_fire_risk_assessment", label: "Fire Risk Assessment Up to Date", type: "select", options: ["Yes", "No", "N/A"], required: false },
            { id: "field_fire_procedures", key: "field_fire_procedures", label: "Emergency Procedures Displayed", type: "select", options: ["Yes", "No"], required: false },
            { id: "field_fire_overall", key: "field_fire_overall", label: "Overall Fire Safety Rating", type: "select", options: ["Compliant", "Minor Issues", "Major Issues", "Non-Compliant"], required: true },
            { id: "field_fire_actions", key: "field_fire_actions", label: "Actions Required", type: "long_text", required: false },
            { id: "field_fire_signature", key: "field_fire_signature", label: "Inspector Signature", type: "signature", required: false },
          ],
        },
      ],
    },
  },
  {
    name: "Health & Safety Inspection",
    description: "Comprehensive health and safety inspection covering building safety, potential hazards, accessibility, and compliance with health regulations.\n\nEssential for maintaining BTR property standards and ensuring tenant wellbeing.",
    scope: "block" as const,
    categoryId: null,
    structureJson: {
      sections: [
        {
          id: "section_general",
          title: "General Information",
          fields: [
            { id: "field_hs_block", key: "field_hs_block", label: "Block/Building Name", type: "short_text", required: true },
            { id: "field_hs_date", key: "field_hs_date", label: "Inspection Date", type: "date", required: true },
            { id: "field_hs_inspector", key: "field_hs_inspector", label: "Inspector Name", type: "short_text", required: true },
          ],
        },
        {
          id: "section_structure",
          title: "Structural Safety",
          fields: [
            { id: "field_hs_walls", key: "field_hs_walls", label: "Walls and Structure", type: "photo_array", required: false, includeCondition: true },
            { id: "field_hs_cracks", key: "field_hs_cracks", label: "Cracks or Structural Damage", type: "select", options: ["None", "Minor", "Major - Urgent"], required: true },
            { id: "field_hs_damp", key: "field_hs_damp", label: "Signs of Damp or Mold", type: "photo_array", required: false, includeCondition: true },
            { id: "field_hs_ceiling", key: "field_hs_ceiling", label: "Ceiling Condition", type: "photo_array", required: false, includeCondition: true },
          ],
        },
        {
          id: "section_electrical",
          title: "Electrical Safety",
          fields: [
            { id: "field_hs_electrical_cert", key: "field_hs_electrical_cert", label: "Electrical Certificates Valid", type: "select", options: ["Yes", "No", "Unknown"], required: false },
            { id: "field_hs_consumer_unit", key: "field_hs_consumer_unit", label: "Consumer Unit/Fuse Box", type: "photo_array", required: false, includeCondition: true },
            { id: "field_hs_sockets", key: "field_hs_sockets", label: "Visible Socket Condition", type: "photo_array", required: false, includeCondition: true },
            { id: "field_hs_electrical_hazards", key: "field_hs_electrical_hazards", label: "Electrical Hazards Identified", type: "select", options: ["None", "Minor Issues", "Major Hazards"], required: true },
          ],
        },
        {
          id: "section_gas",
          title: "Gas Safety",
          fields: [
            { id: "field_hs_gas_cert", key: "field_hs_gas_cert", label: "Gas Safety Certificate Valid", type: "select", options: ["Yes", "No", "N/A - No Gas"], required: false },
            { id: "field_hs_boiler", key: "field_hs_boiler", label: "Boiler Condition", type: "photo_array", required: false, includeCondition: true },
            { id: "field_hs_gas_appliances", key: "field_hs_gas_appliances", label: "Gas Appliances", type: "photo_array", required: false, includeCondition: true },
            { id: "field_hs_ventilation", key: "field_hs_ventilation", label: "Ventilation Adequate", type: "select", options: ["Yes", "No - Improvement Needed"], required: false },
          ],
        },
        {
          id: "section_water",
          title: "Water Safety and Legionella",
          fields: [
            { id: "field_hs_water_temp", key: "field_hs_water_temp", label: "Hot Water Temperature Tested", type: "select", options: ["Pass", "Fail", "Not Tested"], required: false },
            { id: "field_hs_water_storage", key: "field_hs_water_storage", label: "Water Storage Tanks", type: "photo_array", required: false, includeCondition: true },
            { id: "field_hs_legionella", key: "field_hs_legionella", label: "Legionella Risk Assessment Up to Date", type: "select", options: ["Yes", "No", "N/A"], required: false },
            { id: "field_hs_taps", key: "field_hs_taps", label: "Taps and Showers", type: "photo_array", required: false, includeCondition: true },
          ],
        },
        {
          id: "section_access",
          title: "Access and Mobility",
          fields: [
            { id: "field_hs_access_routes", key: "field_hs_access_routes", label: "Accessible Routes Clear", type: "select", options: ["Yes", "No - Obstructions"], required: false },
            { id: "field_hs_handrails", key: "field_hs_handrails", label: "Handrails Secure", type: "photo_array", required: false, includeCondition: true },
            { id: "field_hs_stairs", key: "field_hs_stairs", label: "Stairs and Steps", type: "photo_array", required: false, includeCondition: true },
            { id: "field_hs_lighting", key: "field_hs_lighting", label: "Lighting Adequate", type: "select", options: ["Yes", "No - Improvement Needed"], required: false },
          ],
        },
        {
          id: "section_summary",
          title: "Summary and Actions",
          fields: [
            { id: "field_hs_overall", key: "field_hs_overall", label: "Overall H&S Rating", type: "select", options: ["Compliant", "Minor Issues", "Major Issues", "Non-Compliant"], required: true },
            { id: "field_hs_priority", key: "field_hs_priority", label: "Urgent Actions Required", type: "long_text", required: false },
            { id: "field_hs_recommendations", key: "field_hs_recommendations", label: "Recommendations", type: "long_text", required: false },
            { id: "field_hs_next_inspection", key: "field_hs_next_inspection", label: "Next Inspection Due", type: "date", required: false },
            { id: "field_hs_signature", key: "field_hs_signature", label: "Inspector Signature", type: "signature", required: false },
          ],
        },
      ],
    },
  },
  {
    name: "Common Area Inspection",
    description: "Inspection of shared communal spaces including lobbies, hallways, stairs, lifts, gardens, and amenity areas.\n\nMaintains BTR property standards and ensures shared facilities are well-maintained for all residents.",
    scope: "block" as const,
    categoryId: null,
    structureJson: {
      sections: [
        {
          id: "section_general",
          title: "General Information",
          fields: [
            { id: "field_common_block", key: "field_common_block", label: "Block/Building Name", type: "short_text", required: true },
            { id: "field_common_date", key: "field_common_date", label: "Inspection Date", type: "date", required: true },
            { id: "field_common_inspector", key: "field_common_inspector", label: "Inspector Name", type: "short_text", required: true },
          ],
        },
        {
          id: "section_entrance",
          title: "Main Entrance and Reception",
          fields: [
            { id: "field_common_entrance_doors", key: "field_common_entrance_doors", label: "Entrance Doors", type: "photo_array", required: false, includeCondition: true, includeCleanliness: true },
            { id: "field_common_entrance_floor", key: "field_common_entrance_floor", label: "Floor/Matting", type: "photo_array", required: false, includeCondition: true, includeCleanliness: true },
            { id: "field_common_reception", key: "field_common_reception", label: "Reception Area", type: "photo_array", required: false, includeCondition: true, includeCleanliness: true },
            { id: "field_common_signage", key: "field_common_signage", label: "Building Signage", type: "photo_array", required: false, includeCondition: true },
          ],
        },
        {
          id: "section_corridors",
          title: "Corridors and Hallways",
          fields: [
            { id: "field_common_corridor_walls", key: "field_common_corridor_walls", label: "Walls and Decoration", type: "photo_array", required: false, includeCondition: true, includeCleanliness: true },
            { id: "field_common_corridor_floor", key: "field_common_corridor_floor", label: "Floor Covering", type: "photo_array", required: false, includeCondition: true, includeCleanliness: true },
            { id: "field_common_corridor_lights", key: "field_common_corridor_lights", label: "Lighting Functional", type: "select", options: ["All Working", "Some Out", "Multiple Out"], required: false },
            { id: "field_common_corridor_clutter", key: "field_common_corridor_clutter", label: "Corridors Clear of Obstructions", type: "select", options: ["Yes", "No - Items Noted"], required: false },
          ],
        },
        {
          id: "section_stairs",
          title: "Staircases",
          fields: [
            { id: "field_common_stairs_condition", key: "field_common_stairs_condition", label: "Staircase Condition", type: "photo_array", required: false, includeCondition: true, includeCleanliness: true },
            { id: "field_common_stairs_handrails", key: "field_common_stairs_handrails", label: "Handrails Secure", type: "select", options: ["Yes", "No - Repair Needed"], required: false },
            { id: "field_common_stairs_lighting", key: "field_common_stairs_lighting", label: "Stairwell Lighting", type: "select", options: ["Adequate", "Poor - Improvement Needed"], required: false },
            { id: "field_common_stairs_safety", key: "field_common_stairs_safety", label: "Safety Hazards", type: "select", options: ["None", "Hazards Identified"], required: false },
          ],
        },
        {
          id: "section_lifts",
          title: "Lifts/Elevators",
          fields: [
            { id: "field_common_lift_operational", key: "field_common_lift_operational", label: "Lift Operational", type: "select", options: ["Yes", "No - Out of Service"], required: false },
            { id: "field_common_lift_interior", key: "field_common_lift_interior", label: "Lift Interior", type: "photo_array", required: false, includeCondition: true, includeCleanliness: true },
            { id: "field_common_lift_buttons", key: "field_common_lift_buttons", label: "Buttons and Controls", type: "photo_array", required: false, includeCondition: true },
            { id: "field_common_lift_cert", key: "field_common_lift_cert", label: "Service Certificate Displayed", type: "select", options: ["Yes", "No", "Out of Date"], required: false },
          ],
        },
        {
          id: "section_facilities",
          title: "Communal Facilities",
          fields: [
            { id: "field_common_lounge", key: "field_common_lounge", label: "Communal Lounge", type: "photo_array", required: false, includeCondition: true, includeCleanliness: true },
            { id: "field_common_gym", key: "field_common_gym", label: "Gym/Fitness Area", type: "photo_array", required: false, includeCondition: true, includeCleanliness: true },
            { id: "field_common_laundry", key: "field_common_laundry", label: "Laundry Room", type: "photo_array", required: false, includeCondition: true, includeCleanliness: true },
            { id: "field_common_bike", key: "field_common_bike", label: "Bike Storage", type: "photo_array", required: false, includeCondition: true },
          ],
        },
        {
          id: "section_external",
          title: "External Areas",
          fields: [
            { id: "field_common_grounds", key: "field_common_grounds", label: "Grounds and Landscaping", type: "photo_array", required: false, includeCondition: true, includeCleanliness: true },
            { id: "field_common_bins", key: "field_common_bins", label: "Bin Storage Area", type: "photo_array", required: false, includeCondition: true, includeCleanliness: true },
            { id: "field_common_parking", key: "field_common_parking", label: "Car Park", type: "photo_array", required: false, includeCondition: true, includeCleanliness: true },
            { id: "field_common_external_lights", key: "field_common_external_lights", label: "External Lighting", type: "select", options: ["All Working", "Some Out", "Not Tested"], required: false },
          ],
        },
        {
          id: "section_summary",
          title: "Summary and Actions",
          fields: [
            { id: "field_common_overall", key: "field_common_overall", label: "Overall Condition", type: "select", options: ["Excellent", "Good", "Fair", "Poor"], required: true },
            { id: "field_common_cleaning", key: "field_common_cleaning", label: "Cleaning Standard", type: "select", options: ["Excellent", "Good", "Fair", "Poor"], required: false },
            { id: "field_common_actions", key: "field_common_actions", label: "Actions Required", type: "long_text", required: false },
            { id: "field_common_signature", key: "field_common_signature", label: "Inspector Signature", type: "signature", required: false },
          ],
        },
      ],
    },
  },
  {
    name: "Void Property Inspection",
    description: "Comprehensive inspection of vacant properties between tenancies. Documents the full condition to prepare for new tenants and identifies all required works.\n\nEssential for BTR turnover management and ensuring properties meet letting standards.",
    scope: "property" as const,
    categoryId: null,
    structureJson: {
      sections: [
        {
          id: "section_general",
          title: "General Information",
          fields: [
            { id: "field_void_property", key: "field_void_property", label: "Property Address", type: "short_text", required: true },
            { id: "field_void_date", key: "field_void_date", label: "Inspection Date", type: "date", required: true },
            { id: "field_void_inspector", key: "field_void_inspector", label: "Inspector Name", type: "short_text", required: true },
            { id: "field_void_vacant_since", key: "field_void_vacant_since", label: "Vacant Since", type: "date", required: false },
          ],
        },
        {
          id: "section_keys",
          title: "Keys and Access",
          fields: [
            { id: "field_void_keys", key: "field_void_keys", label: "All Keys Received", type: "select", options: ["Yes - Complete Set", "No - Missing Keys"], required: true },
            { id: "field_void_locks", key: "field_void_locks", label: "Lock Change Required", type: "select", options: ["No", "Yes - Recommended"], required: false },
            { id: "field_void_meter_readings", key: "field_void_meter_readings", label: "Meter Readings Taken", type: "select", options: ["Yes", "No"], required: false },
          ],
        },
        {
          id: "section_decoration",
          title: "Decoration and Repairs",
          fields: [
            { id: "field_void_walls", key: "field_void_walls", label: "Walls - Paint Condition", type: "photo_array", required: false, includeCondition: true },
            { id: "field_void_ceilings", key: "field_void_ceilings", label: "Ceilings", type: "photo_array", required: false, includeCondition: true },
            { id: "field_void_woodwork", key: "field_void_woodwork", label: "Woodwork/Skirting", type: "photo_array", required: false, includeCondition: true },
            { id: "field_void_flooring", key: "field_void_flooring", label: "Flooring", type: "photo_array", required: false, includeCondition: true },
            { id: "field_void_decoration_grade", key: "field_void_decoration_grade", label: "Decoration Standard", type: "select", options: ["Excellent - Let Ready", "Good - Minor Touch-ups", "Fair - Repaint Required", "Poor - Full Redec Needed"], required: true },
          ],
        },
        {
          id: "section_kitchen",
          title: "Kitchen",
          fields: [
            { id: "field_void_kitchen_units", key: "field_void_kitchen_units", label: "Kitchen Units", type: "photo_array", required: false, includeCondition: true, includeCleanliness: true },
            { id: "field_void_kitchen_worktop", key: "field_void_kitchen_worktop", label: "Worktops", type: "photo_array", required: false, includeCondition: true, includeCleanliness: true },
            { id: "field_void_kitchen_sink", key: "field_void_kitchen_sink", label: "Sink and Taps", type: "photo_array", required: false, includeCondition: true, includeCleanliness: true },
            { id: "field_void_kitchen_appliances", key: "field_void_kitchen_appliances", label: "White Goods/Appliances", type: "photo_array", required: false, includeCondition: true },
            { id: "field_void_kitchen_deep_clean", key: "field_void_kitchen_deep_clean", label: "Deep Clean Required", type: "select", options: ["No", "Yes"], required: false },
          ],
        },
        {
          id: "section_bathroom",
          title: "Bathroom",
          repeatable: true,
          fields: [
            { id: "field_void_bath_suite", key: "field_void_bath_suite", label: "Bathroom Suite", type: "photo_array", required: false, includeCondition: true, includeCleanliness: true },
            { id: "field_void_bath_tiling", key: "field_void_bath_tiling", label: "Tiling and Grouting", type: "photo_array", required: false, includeCondition: true, includeCleanliness: true },
            { id: "field_void_bath_shower", key: "field_void_bath_shower", label: "Shower/Bath", type: "photo_array", required: false, includeCondition: true, includeCleanliness: true },
            { id: "field_void_bath_sealant", key: "field_void_bath_sealant", label: "Sealant Condition", type: "select", options: ["Good", "Replacement Needed"], required: false },
          ],
        },
        {
          id: "section_services",
          title: "Services and Safety",
          fields: [
            { id: "field_void_heating", key: "field_void_heating", label: "Heating System Tested", type: "select", options: ["Pass", "Fail", "Not Tested"], required: false },
            { id: "field_void_electric", key: "field_void_electric", label: "Electrical Test Due", type: "date", required: false },
            { id: "field_void_gas", key: "field_void_gas", label: "Gas Safety Due", type: "date", required: false },
            { id: "field_void_smoke_alarms", key: "field_void_smoke_alarms", label: "Smoke Alarms Tested", type: "select", options: ["Pass", "Fail", "Replacement Needed"], required: false },
          ],
        },
        {
          id: "section_schedule",
          title: "Works Schedule",
          fields: [
            { id: "field_void_works_required", key: "field_void_works_required", label: "Works Required", type: "long_text", required: false },
            { id: "field_void_priority", key: "field_void_priority", label: "Priority Level", type: "select", options: ["Urgent - Immediate", "High - Within 1 Week", "Medium - Within 2 Weeks", "Low - Before Relet"], required: true },
            { id: "field_void_estimated_days", key: "field_void_estimated_days", label: "Estimated Days to Complete", type: "number", required: false },
            { id: "field_void_lettable", key: "field_void_lettable", label: "Lettable Standard", type: "select", options: ["Yes - Let Ready", "No - Works Required"], required: true },
            { id: "field_void_signature", key: "field_void_signature", label: "Inspector Signature", type: "signature", required: false },
          ],
        },
      ],
    },
  },
  {
    name: "Block Inspection",
    description: "Comprehensive block/building-level inspection covering external structure, building systems, grounds, and overall property condition.\n\nMaintains BTR asset value and ensures building-wide compliance and maintenance standards.",
    scope: "block" as const,
    categoryId: null,
    structureJson: {
      sections: [
        {
          id: "section_general",
          title: "General Information",
          fields: [
            { id: "field_block_name", key: "field_block_name", label: "Block/Building Name", type: "short_text", required: true },
            { id: "field_block_date", key: "field_block_date", label: "Inspection Date", type: "date", required: true },
            { id: "field_block_inspector", key: "field_block_inspector", label: "Inspector Name", type: "short_text", required: true },
            { id: "field_block_weather", key: "field_block_weather", label: "Weather Conditions", type: "short_text", required: false },
          ],
        },
        {
          id: "section_structure",
          title: "External Structure",
          fields: [
            { id: "field_block_roof", key: "field_block_roof", label: "Roof Condition", type: "photo_array", required: false, includeCondition: true },
            { id: "field_block_chimneys", key: "field_block_chimneys", label: "Chimneys/Vents", type: "photo_array", required: false, includeCondition: true },
            { id: "field_block_walls", key: "field_block_walls", label: "External Walls", type: "photo_array", required: false, includeCondition: true },
            { id: "field_block_cladding", key: "field_block_cladding", label: "Cladding (if applicable)", type: "photo_array", required: false, includeCondition: true },
            { id: "field_block_gutters", key: "field_block_gutters", label: "Gutters and Drainage", type: "photo_array", required: false, includeCondition: true },
          ],
        },
        {
          id: "section_windows",
          title: "Windows and Doors",
          fields: [
            { id: "field_block_windows", key: "field_block_windows", label: "Window Condition", type: "photo_array", required: false, includeCondition: true },
            { id: "field_block_frames", key: "field_block_frames", label: "Window Frames", type: "photo_array", required: false, includeCondition: true },
            { id: "field_block_communal_doors", key: "field_block_communal_doors", label: "Communal Entry Doors", type: "photo_array", required: false, includeCondition: true },
            { id: "field_block_access_control", key: "field_block_access_control", label: "Access Control System", type: "select", options: ["Working", "Faulty", "Not Applicable"], required: false },
          ],
        },
        {
          id: "section_grounds",
          title: "Grounds and External Areas",
          fields: [
            { id: "field_block_grounds", key: "field_block_grounds", label: "Grounds Condition", type: "photo_array", required: false, includeCondition: true, includeCleanliness: true },
            { id: "field_block_paths", key: "field_block_paths", label: "Pathways and Paving", type: "photo_array", required: false, includeCondition: true },
            { id: "field_block_fencing", key: "field_block_fencing", label: "Fencing and Boundaries", type: "photo_array", required: false, includeCondition: true },
            { id: "field_block_gates", key: "field_block_gates", label: "Gates and Barriers", type: "photo_array", required: false, includeCondition: true },
            { id: "field_block_lighting", key: "field_block_lighting", label: "External Lighting", type: "select", options: ["All Working", "Some Out", "Multiple Out"], required: false },
          ],
        },
        {
          id: "section_facilities",
          title: "Building Facilities",
          fields: [
            { id: "field_block_boiler", key: "field_block_boiler", label: "Central Boiler/Plant Room", type: "photo_array", required: false, includeCondition: true },
            { id: "field_block_water", key: "field_block_water", label: "Water Tanks/Systems", type: "photo_array", required: false, includeCondition: true },
            { id: "field_block_electric", key: "field_block_electric", label: "Main Electrical Supply", type: "photo_array", required: false, includeCondition: true },
            { id: "field_block_cctv", key: "field_block_cctv", label: "CCTV System", type: "select", options: ["Working", "Faulty", "Not Applicable"], required: false },
          ],
        },
        {
          id: "section_compliance",
          title: "Compliance and Certification",
          fields: [
            { id: "field_block_fire_cert", key: "field_block_fire_cert", label: "Fire Risk Assessment Up to Date", type: "select", options: ["Yes", "No", "Due Soon"], required: false },
            { id: "field_block_lift_cert", key: "field_block_lift_cert", label: "Lift Certificates Valid", type: "select", options: ["Yes", "No", "N/A"], required: false },
            { id: "field_block_legionella", key: "field_block_legionella", label: "Legionella Assessment Current", type: "select", options: ["Yes", "No", "N/A"], required: false },
            { id: "field_block_asbestos", key: "field_block_asbestos", label: "Asbestos Register Up to Date", type: "select", options: ["Yes", "No", "N/A"], required: false },
          ],
        },
        {
          id: "section_summary",
          title: "Summary and Recommendations",
          fields: [
            { id: "field_block_overall", key: "field_block_overall", label: "Overall Building Condition", type: "select", options: ["Excellent", "Good", "Fair", "Poor"], required: true },
            { id: "field_block_urgent", key: "field_block_urgent", label: "Urgent Issues", type: "long_text", required: false },
            { id: "field_block_planned", key: "field_block_planned", label: "Planned Maintenance Recommendations", type: "long_text", required: false },
            { id: "field_block_next", key: "field_block_next", label: "Next Inspection Date", type: "date", required: false },
            { id: "field_block_signature", key: "field_block_signature", label: "Inspector Signature", type: "signature", required: false },
          ],
        },
      ],
    },
  },
];
