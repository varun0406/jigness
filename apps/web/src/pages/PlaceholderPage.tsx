import { Box, Typography } from "@mui/material";

export function PlaceholderPage(props: { title: string; subtitle?: string }) {
  return (
    <Box>
      <Typography variant="h5" fontWeight={900} sx={{ mb: 0.5 }}>
        {props.title}
      </Typography>
      <Typography color="text.secondary">
        {props.subtitle ?? "Coming next — this screen is wired up in the next step."}
      </Typography>
    </Box>
  );
}

