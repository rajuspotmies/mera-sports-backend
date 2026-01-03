import express from "express";
import { supabaseAdmin } from "../config/supabaseClient.js";

import { verifyAdmin } from "../middleware/rbacMiddleware.js";

const router = express.Router();

// GET all contact messages (Admin Only)
router.get("/", verifyAdmin, async (req, res) => {
    try {
        const { data: messages, error } = await supabaseAdmin
            .from("contact_messages")
            .select("*")
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({ success: true, messages });
    } catch (error) {
        console.error("FETCH CONTACTS ERROR:", error.message);
        res.status(500).json({ success: false, message: "Failed to fetch messages" });
    }
});

// PUT update contact message status (Admin Only)
router.put("/:id/status", verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // 'cleared' | 'ticket' | 'pending'

        if (!['cleared', 'ticket', 'pending'].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status" });
        }

        const { data, error } = await supabaseAdmin
            .from("contact_messages")
            .update({ status })
            .eq("id", id)
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, message: "Status updated", data });
    } catch (error) {
        console.error("UPDATE CONTACT ERROR:", error.message);
        res.status(500).json({ success: false, message: "Failed to update status" });
    }
});

router.post("/send", async (req, res) => {
    const { name, email, phone, subject, message } = req.body;

    try {
        // Insert submission directly into the 'contact_messages' table
        const { error } = await supabaseAdmin
            .from("contact_messages")
            .insert({
                name,
                email,
                phone,
                subject,
                message
            });

        if (error) throw error;

        res.status(200).json({ success: true, message: "Message saved successfully" });

    } catch (error) {
        console.error("CONTACT DB ERROR:", error.message);
        res.status(500).json({ success: false, message: "Failed to save message" });
    }
});

//Code to store data in excel file

// import express from "express";
// import xlsx from "xlsx";
// import fs from "fs";
// import path from "path";
// import { fileURLToPath } from "url";

// const router = express.Router();

// // Get directory name in ES Module scope
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // Path to store the Excel file (e.g., in the backend root folder)
// const FILE_PATH = path.join(__dirname, "../contact_submissions.xlsx");

// router.post("/send", async (req, res) => {
//   const { name, email, phone, subject, message } = req.body;

//   try {
//     // 1. Prepare the new data row with a timestamp
//     const newData = {
//       Name: name,
//       Email: email,
//       Phone: phone,
//       Subject: subject,
//       Message: message,
//       Date: new Date().toLocaleString(), // Adds submission time
//     };

//     let workbook;
//     let worksheet;
//     let existingData = [];

//     // 2. Check if the Excel file already exists
//     if (fs.existsSync(FILE_PATH)) {
//       // Read existing file
//       workbook = xlsx.readFile(FILE_PATH);
//       const sheetName = workbook.SheetNames[0];
//       worksheet = workbook.Sheets[sheetName];

//       // Convert existing sheet data to JSON array
//       existingData = xlsx.utils.sheet_to_json(worksheet);
//     } else {
//       // Create a new workbook if file doesn't exist
//       workbook = xlsx.utils.book_new();
//     }

//     // 3. Add the new submission to the data array
//     existingData.push(newData);

//     // 4. Convert the updated data back to a worksheet
//     const newWorksheet = xlsx.utils.json_to_sheet(existingData);

//     // 5. Append/Update worksheet in workbook
//     // If workbook is new, append sheet; if existing, replace sheet
//     if (workbook.SheetNames.length === 0) {
//       xlsx.utils.book_append_sheet(workbook, newWorksheet, "Submissions");
//     } else {
//       workbook.Sheets[workbook.SheetNames[0]] = newWorksheet;
//     }

//     // 6. Save the file
//     xlsx.writeFile(workbook, FILE_PATH);

//     console.log("Form saved to Excel:", newData.Name);
//     res.status(200).json({ success: true, message: "Submission saved successfully" });

//   } catch (error) {
//     console.error("EXCEL ERROR:", error);
//     res.status(500).json({ success: false, message: "Failed to save submission" });
//   }
// });

// export default router;

//Frontend Code

// const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault();
//     setIsLoading(true);

//     try {
//       const response = await fetch(`${import.meta.env.VITE_API_URL}/api/contact/send`, {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify(formData),
//       });

//       const data = await response.json();

//       if (response.ok && data.success) {
//         toast.success("Message saved! We'll be in touch.");
//         setFormData({ name: "", email: "", phone: "", subject: "", message: "" });
//       } else {
//         toast.error("Failed to submit form.");
//       }
//     } catch (error) {
//       toast.error("Network error.");
//     } finally {
//       setIsLoading(false);
//     }
//   };

export default router;